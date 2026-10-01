import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type {
  AppState,
  Batch,
  ComponentDoc,
  Draft,
  HistoryEntry,
  JointType,
  Relation,
  RelationReview,
} from "./types";
import { buildInitialState, TEAMS } from "./data/seed";
import {
  FIELDS,
  affectedNodeIds,
  edgesTouching,
  localRelationView,
  recomputeAfterComponentChange,
  startMerge,
  uid,
  unresolved,
} from "./logic/engine";

const STORAGE_KEY = "survey-station-v1";

export interface MeasureInput {
  building: string;
  componentId: string;
  woodType: string;
  jointType: JointType;
  section: string;
  diseaseLocation: string;
  deformation: string;
  repairSuggestion: string;
  measuredAt: number;
  statusAction?: Draft["statusAction"];
  note?: string;
}

type Action =
  | { type: "toggleOnline" }
  | { type: "setOnline"; online: boolean }
  | { type: "setTeam"; team: string }
  | { type: "setFailAt"; n: number }
  | { type: "dismissNotice"; id: string }
  | { type: "pushNotice"; kind: "info" | "warn" | "ok"; text: string }
  | { type: "saveDraft"; input: MeasureInput }
  | { type: "componentActionOnline"; componentId: string; action: NonNullable<Draft["statusAction"]> }
  | { type: "beginMerge" }
  | { type: "cancelMerge" }
  | { type: "resolveField"; key: string; resolution: "local" | "remote" }
  | { type: "confirmFields" }
  | { type: "resolveRelation"; key: string; resolution: "local" | "remote" }
  | { type: "confirmRelations" }
  | { type: "uploadBatch"; batchId: string }
  | { type: "review"; id: string; decision: "approved" | "rejected" }
  | { type: "simRemote"; kind: "joint" | "deactivate" | "disease" }
  | { type: "reset" };

let clock = 0;
const now = () => Date.now() + clock++;

function historyEntry(
  team: string,
  kind: HistoryEntry["kind"],
  summary: string,
  snapshot?: unknown
): HistoryEntry {
  return { id: uid("h"), at: now(), team, kind, summary, snapshot };
}

function loadInitial(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.server && parsed.local) {
        return { ...parsed, online: navigator.onLine, notices: [] };
      }
    }
  } catch {
    /* 数据损坏时回退种子 */
  }
  return migrateLegacy(buildInitialState());
}

/** 老草稿缺批次标识：按最后编辑时间补一版，原记录留档 */
function migrateLegacy(state: AppState): AppState {
  const orphans = state.local.drafts.filter((d) => d.batchId === undefined);
  if (orphans.length === 0) return state;

  const batches = { ...state.local.batches };
  const drafts = state.local.drafts.map((d) => ({ ...d }));
  const entries: HistoryEntry[] = [];

  for (const d of drafts) {
    if (d.batchId !== undefined) continue;
    const original = structuredClone(d); // 原记录留档（缺批次号版本仍可查）
    const date = new Date(d.updatedAt);
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
      date.getDate()
    ).padStart(2, "0")}`;
    const batchId = `B-补版-${stamp}`;
    d.batchId = batchId;
    d.backfilled = true;
    batches[batchId] ??= {
      id: batchId,
      team: d.team,
      createdAt: d.updatedAt,
      status: "queueing",
      draftIds: [],
      cursor: 0,
      failCount: 0,
    };
    if (!batches[batchId].draftIds.includes(d.id)) batches[batchId].draftIds.push(d.id);
    entries.push(
      historyEntry(d.team, "legacy", `老草稿 ${d.componentId} 缺批次号，按最后编辑时间补版 → ${batchId}`, original)
    );
  }
  return {
    ...state,
    local: { ...state.local, drafts, batches },
    history: [...entries, ...state.history],
    notices: [
      ...state.notices,
      {
        id: uid("n"),
        kind: "warn",
        text: `检测到 ${orphans.length} 条无批次号老草稿，已按最后编辑时间补版，原记录在“履历留档”可查`,
      },
    ],
  };
}

function newTeamBatch(team: string, ref: number): Batch {
  const date = new Date(ref);
  return {
    id: `B-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
      date.getDate()
    ).padStart(2, "0")}-${uid("").slice(-4)}`,
    team,
    createdAt: ref,
    status: "queueing",
    draftIds: [],
    cursor: 0,
    failCount: 0,
  };
}

/** 为失效边生成审核单（去重：同关系待审单只留一条），返回新增的审核单 */
function makeReviews(
  server: AppState["server"],
  existingPending: Set<string>,
  stale: Relation[],
  cause: RelationReview["cause"],
  sourceId: string,
  targetId?: string,
  affectedOverride?: string[]
): RelationReview[] {
  return stale
    .filter((edge) => !existingPending.has(edge.id))
    .map((edge) => ({
      id: uid("rv"),
      relationId: edge.id,
      building: edge.building,
      cause,
      sourceId,
      targetId,
      from: edge.from,
      to: edge.to,
      oldJoint: edge.joint,
      affectedNodeIds:
        affectedOverride ?? affectedNodeIds(server.relations, edgesTouching(server.relations, sourceId)),
      reason: edge.reason ?? "构件引用失效",
      status: "pending" as const,
      createdAt: now(),
    }));
}

function writeMeasurement(server: AppState["server"], draft: Draft, batchId: string) {
  server.measurements.push({
    id: draft.id, // 幂等键：同一草稿只写入一次
    batchId,
    team: draft.team,
    building: draft.building,
    componentId: draft.componentId,
    woodType: draft.woodType,
    jointType: draft.jointType,
    section: draft.section,
    diseaseLocation: draft.diseaseLocation,
    deformation: draft.deformation,
    repairSuggestion: draft.repairSuggestion,
    measuredAt: draft.measuredAt,
    writtenAt: now(),
  });
}

/** 把一份草稿的字段值应用到构件档案 */
function applyFieldsToComponent(server: AppState["server"], draft: Draft) {
  const existing = server.components[draft.componentId];
  if (existing) {
    for (const { key } of FIELDS) {
      (existing as unknown as Record<string, unknown>)[key] = draft[key as keyof Draft];
    }
    existing.updatedAt = now();
    existing.rev += 1;
  } else {
    server.components[draft.componentId] = {
      id: draft.componentId,
      building: draft.building,
      name: `新构件 ${draft.componentId}`,
      woodType: draft.woodType,
      jointType: draft.jointType,
      section: draft.section,
      diseaseLocation: draft.diseaseLocation,
      deformation: draft.deformation,
      repairSuggestion: draft.repairSuggestion,
      status: "active",
      updatedAt: now(),
      rev: 1,
    };
  }
}

function applyStatusAction(server: AppState["server"], componentId: string, act: NonNullable<Draft["statusAction"]>) {
  const c = server.components[componentId];
  if (!c) return;
  c.status = act.type === "deactivate" ? "deactivated" : "replaced";
  c.replacedBy = act.type === "replace" ? act.targetId : undefined;
  c.updatedAt = now();
  c.rev += 1;
}

/** 停用/替换后失效关系、挂审核单 */
function invalidateAndReview(s: AppState, componentId: string, act: NonNullable<Draft["statusAction"]>) {
  applyStatusAction(s.server, componentId, act);
  const rec = recomputeAfterComponentChange(s.server.components, s.server.relations, [componentId]);
  s.server.relations = rec.relations;
  const pending = new Set(s.reviews.filter((r) => r.status === "pending").map((r) => r.relationId));
  const reviews = makeReviews(s.server, pending, rec.invalidEdges, act.type, componentId, act.targetId, rec.affected);
  s.reviews = [...reviews, ...s.reviews];
  return rec;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "reset":
      localStorage.removeItem(STORAGE_KEY);
      return migrateLegacy(buildInitialState());

    case "setOnline":
      return { ...state, online: action.online };

    case "toggleOnline": {
      if (state.online) {
        // 断网瞬间冻结站端快照，作为恢复后的三路合并基线
        const bases: Record<string, ComponentDoc> = {};
        for (const id of Object.keys(state.server.components)) bases[id] = structuredClone(state.server.components[id]);
        return {
          ...state,
          online: false,
          local: { ...state.local, bases, baseRelations: structuredClone(state.server.relations) },
          notices: [...state.notices, { id: uid("n"), kind: "warn", text: "已断网：测量写入本地草稿，恢复联网后先合并差异" }],
        };
      }
      return {
        ...state,
        online: true,
        notices: [...state.notices, { id: uid("n"), kind: "info", text: "网络已恢复：请在同步中心先合并差异，确认后再上传批次" }],
      };
    }

    case "setTeam":
      return { ...state, activeTeam: action.team };

    case "setFailAt":
      return { ...state, failAt: action.n };

    case "dismissNotice":
      return { ...state, notices: state.notices.filter((n) => n.id !== action.id) };

    case "pushNotice":
      return { ...state, notices: [...state.notices, { id: uid("n"), kind: action.kind, text: action.text }] };

    case "saveDraft": {
      const { input } = action;
      const team = state.activeTeam;
      const t = now();
      const draft: Draft = {
        id: uid("draft"),
        team,
        building: input.building,
        componentId: input.componentId.trim() || uid("C"),
        woodType: input.woodType,
        jointType: input.jointType,
        section: input.section,
        diseaseLocation: input.diseaseLocation,
        deformation: input.deformation,
        repairSuggestion: input.repairSuggestion,
        measuredAt: input.measuredAt,
        updatedAt: t,
        state: "pending",
        baseRev: state.server.components[input.componentId]?.rev ?? 0,
        statusAction: input.statusAction,
        note: input.note,
      };
      const hist = historyEntry(
        team,
        "measure",
        `测量草稿 ${draft.componentId}（截面 ${draft.section || "未填"}；${draft.diseaseLocation || "无病害记录"}）`,
        structuredClone(draft)
      );

      if (state.online) {
        // 在线：直接入库，仍保留本地草稿（已写入，可查）
        const s: AppState = structuredClone(state);
        const batch = newTeamBatch(team, t);
        writeMeasurement(s.server, draft, batch.id);
        applyFieldsToComponent(s.server, draft);
        let rec: ReturnType<typeof recomputeAfterComponentChange> | null = null;
        if (draft.statusAction) {
          rec = invalidateAndReview(s, draft.componentId, draft.statusAction);
        }
        s.local.drafts.push({ ...draft, batchId: batch.id, state: "written" });
        batch.status = "uploaded";
        batch.draftIds = [draft.id];
        batch.cursor = 1;
        batch.lastComponentId = draft.componentId;
        s.local.batches[batch.id] = batch;
        s.server.rev += 1;
        s.history = [hist, ...s.history];
        s.notices = [
          ...s.notices,
          {
            id: uid("n"),
            kind: "ok",
            text: rec
              ? `在线测量 ${draft.componentId} 已入库；${rec.invalidEdges.length} 条关系失效待审，受影响节点：${rec.affected.join("、") || "无"}`
              : `在线测量 ${draft.componentId} 已直接入库（批次 ${batch.id}）`,
          },
        ];
        return s;
      }

      // 离线：进批次草稿
      const existing = Object.values(state.local.batches).find((b) => b.team === team && b.status === "queueing");
      const batch = existing ?? newTeamBatch(team, t);
      const batches = {
        ...state.local.batches,
        [batch.id]: { ...batch, draftIds: [...batch.draftIds, draft.id] },
      };
      const bases = { ...state.local.bases };
      if (!bases[draft.componentId] && state.server.components[draft.componentId]) {
        bases[draft.componentId] = structuredClone(state.server.components[draft.componentId]);
      }
      const baseRelations = state.local.baseRelations ?? structuredClone(state.server.relations);
      return {
        ...state,
        local: { ...state.local, drafts: [...state.local.drafts, { ...draft, batchId: batch.id }], batches, bases, baseRelations },
        history: [hist, ...state.history],
        notices: [...state.notices, { id: uid("n"), kind: "info", text: `已离线保存草稿 ${draft.componentId} → 批次 ${batch.id}` }],
      };
    }

    case "componentActionOnline": {
      // 在线停用/替换：立即改档案、失效关系、显示受影响节点并挂审核单
      const s: AppState = structuredClone(state);
      if (!s.server.components[action.componentId]) return state;
      const rec = invalidateAndReview(s, action.componentId, action.action);
      s.server.rev += 1;
      s.history = [
        historyEntry(
          state.activeTeam,
          "relation",
          `${action.componentId} 已${action.action.type === "deactivate" ? "停用" : `替换为 ${action.action.targetId}`}：${rec.invalidEdges.length} 条榫卯关系失效，受影响节点 ${rec.affected.join("、") || "无"}，审核后才恢复`,
          { edges: rec.invalidEdges, affected: rec.affected }
        ),
        ...s.history,
      ];
      s.notices = [
        ...s.notices,
        {
          id: uid("n"),
          kind: "warn",
          text: `${action.componentId} 已${action.action.type === "deactivate" ? "停用" : "替换"}，${rec.invalidEdges.length} 条关系失效待审，受影响节点：${rec.affected.join("、") || "无"}`,
        },
      ];
      return s;
    }

    case "beginMerge": {
      const pending = state.local.drafts.filter((d) => d.team === state.activeTeam && d.state === "pending");
      if (pending.length === 0) {
        return { ...state, notices: [...state.notices, { id: uid("n"), kind: "info", text: "当前没有待合并的本地草稿" }] };
      }
      return { ...state, merge: startMerge(state, state.activeTeam) };
    }

    case "cancelMerge":
      return { ...state, merge: null };

    case "resolveField": {
      if (!state.merge) return state;
      return {
        ...state,
        merge: {
          ...state.merge,
          fieldDiffs: state.merge.fieldDiffs.map((d) => (d.key === action.key ? { ...d, resolution: action.resolution } : d)),
        },
      };
    }

    case "confirmFields": {
      if (!state.merge || state.merge.fieldDiffs.some((d) => unresolved(d))) return state;
      const s: AppState = structuredClone(state);
      const merge = s.merge!;
      const draftsByComp = new Map<string, Draft>();
      for (const d of s.local.drafts) {
        if (d.team === merge.team && d.state === "pending") draftsByComp.set(d.componentId, d);
      }

      const touched = new Set<string>();
      for (const diff of merge.fieldDiffs) {
        if (diff.field === "__status__") continue;
        if (diff.resolution !== "local") continue;
        touched.add(diff.componentId);
        const draft = draftsByComp.get(diff.componentId);
        if (draft) applyFieldsToComponent(s.server, draft);
      }
      for (const diff of merge.fieldDiffs) {
        if (diff.field !== "__status__" || diff.resolution !== "local") continue;
        touched.add(diff.componentId);
        const draft = draftsByComp.get(diff.componentId);
        if (draft?.statusAction) applyStatusAction(s.server, draft.componentId, draft.statusAction);
      }

      merge.stage = "relations";
      s.server.rev += 1;
      s.history = [
        historyEntry(merge.team, "merge", `字段差异确认完成（${merge.fieldDiffs.length} 项，涉及 ${touched.size} 构件），进入榫卯关系差异确认；关系暂未更新`, {
          touched: [...touched],
          fieldDiffs: merge.fieldDiffs,
        }),
        ...s.history,
      ];
      s.notices = [
        ...s.notices,
        { id: uid("n"), kind: "info", text: `字段差异已确认，请继续确认榫卯关系差异；全部确认后才更新建筑关系` },
      ];
      return s;
    }

    case "resolveRelation": {
      if (!state.merge) return state;
      return {
        ...state,
        merge: {
          ...state.merge,
          relationDiffs: state.merge.relationDiffs.map((d) => (d.key === action.key ? { ...d, resolution: action.resolution } : d)),
        },
      };
    }

    case "confirmRelations": {
      if (!state.merge || state.merge.relationDiffs.some((d) => unresolved(d))) return state;
      const s: AppState = structuredClone(state);
      const merge = s.merge!;
      const pendingDrafts = s.local.drafts.filter((d) => d.team === merge.team && d.state === "pending");
      const localView = localRelationView(s, pendingDrafts);

      // 应用关系选择（local 采用本地视图的榫卯；remote 保持站端）
      s.server.relations = s.server.relations.map((r) => {
        if (r.archived) return r;
        const diff = merge.relationDiffs.find((x) => x.relationId === r.id);
        if (diff?.resolution === "local") {
          const lv = localView.get(r.id);
          if (lv) return { ...r, joint: lv.joint };
        }
        return r;
      });

      // 差异全部确认完，才更新建筑关系：停用/替换/榫卯改型的边失效重算
      const touchedIds = new Set<string>();
      for (const d of pendingDrafts) if (d.statusAction) touchedIds.add(d.componentId);
      for (const diff of merge.fieldDiffs) {
        if (diff.field === "jointType" && diff.resolution === "local") touchedIds.add(diff.componentId);
        // 别队已停用/替换的构件即使本地只改了字段，也必须重算其引用关系
        const c = s.server.components[diff.componentId];
        if (c && c.status !== "active") touchedIds.add(diff.componentId);
      }

      const rec = recomputeAfterComponentChange(s.server.components, s.server.relations, [...touchedIds]);
      s.server.relations = rec.relations;

      const pendingRvs = new Set(s.reviews.filter((r) => r.status === "pending").map((r) => r.relationId));
      const newReviews = makeReviews(
        s.server,
        pendingRvs,
        rec.invalidEdges,
        "recompute",
        [...touchedIds][0] ?? "",
        undefined,
        rec.affected
      );
      // 审核单原因按各边来源细分
      for (const rv of newReviews) {
        const ownerDraft = pendingDrafts.find((d) => d.componentId === rv.from);
        if (ownerDraft?.statusAction?.type === "deactivate") rv.cause = "deactivate";
        else if (ownerDraft?.statusAction?.type === "replace") {
          rv.cause = "replace";
          rv.targetId = ownerDraft.statusAction.targetId;
        }
      }
      s.reviews = [...newReviews, ...s.reviews];

      // 草稿转 confirmed；原批次就绪，等待按批次上传
      const draftIdSet = new Set(pendingDrafts.map((d) => d.id));
      s.local.drafts = s.local.drafts.map((d) => (draftIdSet.has(d.id) ? { ...d, state: "confirmed" } : d));
      const markReady = (bid?: string) => {
        if (!bid) return;
        const b = s.local.batches[bid];
        if (b && (b.status === "queueing" || b.status === "failed")) s.local.batches[bid] = { ...b, status: "ready" };
      };
      for (const bid of merge.batchIds) markReady(bid);
      for (const d of pendingDrafts) markReady(d.batchId);

      s.server.rev += 1;
      s.local.bases = {};
      s.local.baseRelations = null;
      s.merge = { ...merge, stage: "done" };
      s.history = [
        historyEntry(
          merge.team,
          "merge",
          `全部差异确认完成，建筑关系已更新：${rec.invalidEdges.length} 条关系失效待审，受影响节点 ${rec.affected.join("、") || "无"}；批次进入待上传`,
          { relationDiffs: merge.relationDiffs, invalidEdges: rec.invalidEdges, affected: rec.affected }
        ),
        ...s.history,
      ];
      s.notices = [
        ...s.notices,
        { id: uid("n"), kind: "ok", text: `差异全部确认，关系已重算：${rec.invalidEdges.length} 条待审核，受影响节点 ${rec.affected.join("、") || "无"}；可按批次上传` },
      ];
      return s;
    }

    case "uploadBatch": {
      // 按原批次重试：游标沿完整 draftIds 前进，已写入的测量不重复
      const s: AppState = structuredClone(state);
      const batch = s.local.batches[action.batchId];
      if (!batch || !["ready", "failed", "uploading"].includes(batch.status)) return state;

      batch.status = "uploading";
      const ordered = batch.draftIds.map((id) => s.local.drafts.find((d) => d.id === id));
      let writesThisAttempt = 0;

      for (let i = batch.cursor; i < ordered.length; i++) {
        const draft = ordered[i];

        // 非待写条目（缺失/已跳过）：推进游标但不计数
        if (!draft || draft.state === "skipped") {
          batch.cursor = i + 1;
          continue;
        }
        // 已写入（上次重试或已入库）：跳过，绝不重复
        if (draft.state === "written" || s.server.measurements.some((m) => m.id === draft.id)) {
          draft.state = "written";
          batch.cursor = i + 1;
          batch.lastComponentId = draft.componentId;
          continue;
        }

        writesThisAttempt += 1;
        if (state.failAt > 0 && writesThisAttempt === state.failAt) {
          batch.status = "failed";
          batch.failCount += 1;
          s.failAt = 0;
          s.history = [
            historyEntry(
              batch.team,
              "system",
              `批次 ${batch.id} 第 ${writesThisAttempt} 条（构件 ${draft.componentId}）上传失败，断点保留：已写入 ${batch.cursor}/${ordered.length}，将从该构件重试`,
              { batchId: batch.id, cursor: batch.cursor, resumeFrom: draft.componentId }
            ),
            ...s.history,
          ];
          s.notices = [
            ...s.notices,
            {
              id: uid("n"),
              kind: "warn",
              text: `批次 ${batch.id} 上传中断于 ${draft.componentId}：已确认 ${batch.cursor}/${ordered.length}，重试从该构件继续，已写入测量不重复`,
            },
          ];
          return s;
        }

        writeMeasurement(s.server, draft, batch.id);
        draft.state = "written";
        batch.cursor = i + 1;
        batch.lastComponentId = draft.componentId;
      }

      batch.status = "uploaded";
      s.server.rev += 1;
      s.history = [
        historyEntry(
          batch.team,
          "system",
          `批次 ${batch.id} 上传完成：本次写入 ${writesThisAttempt} 条测量，最后确认构件 ${batch.lastComponentId ?? "-"}`,
          { batchId: batch.id }
        ),
        ...s.history,
      ];
      s.notices = [
        ...s.notices,
        { id: uid("n"), kind: "ok", text: `批次 ${batch.id} 上传完成（断点续传，无重复写入；末构件 ${batch.lastComponentId ?? "-"}）` },
      ];
      return s;
    }

    case "review": {
      const s: AppState = structuredClone(state);
      const rv = s.reviews.find((r) => r.id === action.id);
      if (!rv || rv.status !== "pending") return state;
      const edge = s.server.relations.find((r) => r.id === rv.relationId);

      if (action.decision === "approved") {
        const from = s.server.components[rv.from];
        const to = s.server.components[rv.to];
        if (!from || !to || from.status !== "active" || to.status !== "active") {
          s.notices = [...s.notices, { id: uid("n"), kind: "warn", text: `端点构件尚非在用（${rv.from} / ${rv.to}），关系 ${rv.relationId} 不能恢复` }];
          return s;
        }
        if (edge) {
          edge.valid = true;
          edge.joint = from.jointType;
          edge.reason = undefined;
        }
        rv.status = "approved";
      } else {
        rv.status = "rejected";
        if (edge) edge.archived = true; // 驳回：关系归档，不再参与关系视图
      }
      s.server.rev += 1;
      s.history = [
        historyEntry(
          state.activeTeam,
          "review",
          `关系 ${rv.relationId}（${rv.from} ⇢ ${rv.to}）审核${action.decision === "approved" ? `通过，按 ${s.server.components[rv.from]?.jointType} 恢复` : "驳回，已归档"}`,
          structuredClone(rv)
        ),
        ...s.history,
      ];
      return s;
    }

    case "simRemote": {
      // 模拟断网期间别的测绘队回站提交（只改站端，本地基线不变 → 恢复后产生冲突）
      if (state.online) {
        return { ...state, notices: [...state.notices, { id: uid("n"), kind: "info", text: "请先断网，再模拟别队回站提交" }] };
      }
      const s: AppState = structuredClone(state);
      const other = TEAMS.find((t) => t !== state.activeTeam) ?? "乙组";
      let summary = "";
      if (action.kind === "joint") {
        const c = s.server.components["A-03"];
        if (c) {
          c.jointType = "箍头榫";
          c.section = "182×241mm";
          c.updatedAt = now();
          c.rev += 1;
        }
        const r = s.server.relations.find((x) => x.id === "R-05");
        if (r) r.joint = "箍头榫";
        summary = `${other} 回站提交：五架梁 A-03 榫卯改判为箍头榫（可能与你的草稿冲突）`;
      } else if (action.kind === "deactivate") {
        const c = s.server.components["C-01"];
        if (c) {
          c.status = "replaced";
          c.replacedBy = "C-01-新";
          c.updatedAt = now();
          c.rev += 1;
        }
        summary = `${other} 回站提交：前檐柱 C-01 已替换为 C-01-新（引用关系待重算）`;
      } else {
        const c = s.server.components["P-11"];
        if (c) {
          c.diseaseLocation = "脊檩东侧新发现环裂 90mm";
          c.repairSuggestion = "改为墩接并加铁箍";
          c.updatedAt = now();
          c.rev += 1;
        }
        summary = `${other} 回站提交：脊檩 P-11 新增环裂病害记录`;
      }
      s.server.rev += 1;
      s.history = [historyEntry(other, "remote", summary), ...s.history];
      s.notices = [...s.notices, { id: uid("n"), kind: "info", text: `模拟：${summary}` }];
      return s;
    }

    default:
      return state;
  }
}

interface Store {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // 浏览器真实联网状态联动
  useEffect(() => {
    const goOnline = () => dispatch({ type: "setOnline", online: true });
    const goOffline = () => dispatch({ type: "setOnline", online: false });
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

/** 仅供逻辑走查脚本使用 */
export const __testing = { reducer, migrateLegacy };
