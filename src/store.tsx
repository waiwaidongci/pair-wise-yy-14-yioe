import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type {
  ComponentRecord,
  ConflictItem,
  DraftBatch,
  LogEntry,
  Relationship,
  RelStatus,
  ComponentStatus,
} from "./types";
import { uid, fmtTime } from "./lib/utils";
import { loadState, saveState } from "./lib/db";
import { pushBatch, resetServer, type ServerState } from "./lib/server";
import { diffComponents, recomputeRelationships } from "./lib/merge";
import { migrateLegacyDrafts } from "./lib/migrate";

interface PersistState {
  online: boolean;
  chaos: boolean;
  currentBatchId: string;
  batches: DraftBatch[];
  components: ComponentRecord[];
  relationships: Relationship[];
  conflicts: ConflictItem[];
  reviewIds: string[];
  server: ServerState;
  logs: LogEntry[];
}

interface Store extends PersistState {
  addLog: (text: string, kind?: LogEntry["kind"]) => void;
  toggleOnline: () => void;
  toggleChaos: () => void;
  addComponent: (
    input: Omit<
      ComponentRecord,
      "id" | "batchId" | "seq" | "updatedAt" | "createdAt" | "legacy" | "status"
    > & { status?: ComponentStatus },
  ) => void;
  deactivate: (id: string) => void;
  replaceComponent: (id: string) => void;
  runMerge: () => void;
  resolveConflict: (id: string, resolution: "local" | "server") => void;
  resolveAll: (resolution: "local" | "server") => void;
  confirmMerge: () => void;
  reviewRel: (id: string, action: "restore" | "keep") => void;
  uploadBatch: (batchId: string) => Promise<void>;
  migrate: () => void;
  resetAll: () => void;
}

const StoreContext = createContext<Store | null>(null);

type Action =
  | { type: "ADD_LOG"; entry: LogEntry }
  | { type: "SET_ONLINE"; online: boolean }
  | { type: "SET_CHAOS"; chaos: boolean }
  | { type: "SET_CURRENT_BATCH"; batchId: string }
  | { type: "ADD_COMPONENT"; component: ComponentRecord; batchId: string }
  | {
      type: "SET_COMPONENTS";
      components: ComponentRecord[];
      relationships?: Relationship[];
      reviewIds?: string[];
    }
  | { type: "SET_CONFLICTS"; conflicts: ConflictItem[] }
  | { type: "RESOLVE_CONFLICT"; id: string; resolution: "local" | "server" }
  | { type: "RESOLVE_ALL"; resolution: "local" | "server" }
  | {
      type: "MERGE_CONFIRMED";
      components: ComponentRecord[];
      relationships: Relationship[];
      reviewIds: string[];
      server: ServerState;
    }
  | { type: "REVIEW_REL"; relationships: Relationship[]; reviewIds: string[] }
  | {
      type: "BATCH_PATCH";
      batchId: string;
      patch: Partial<DraftBatch>;
    }
  | {
      type: "MIGRATE";
      batches: DraftBatch[];
      components: ComponentRecord[];
    }
  | { type: "RESET"; state: PersistState };

function reducer(state: PersistState, action: Action): PersistState {
  switch (action.type) {
    case "ADD_LOG":
      return { ...state, logs: [action.entry, ...state.logs].slice(0, 120) };
    case "SET_ONLINE":
      return { ...state, online: action.online };
    case "SET_CHAOS":
      return { ...state, chaos: action.chaos };
    case "SET_CURRENT_BATCH":
      return { ...state, currentBatchId: action.batchId };
    case "ADD_COMPONENT": {
      const now = Date.now();
      const batches = state.batches.map((b) =>
        b.id === action.batchId
          ? { ...b, total: b.total + 1, lastEditAt: now }
          : b,
      );
      return {
        ...state,
        batches,
        components: [...state.components, action.component],
      };
    }
    case "SET_COMPONENTS":
      return {
        ...state,
        components: action.components,
        relationships: action.relationships ?? state.relationships,
        reviewIds: action.reviewIds ?? state.reviewIds,
      };
    case "SET_CONFLICTS":
      return { ...state, conflicts: action.conflicts };
    case "RESOLVE_CONFLICT":
      return {
        ...state,
        conflicts: state.conflicts.map((c) =>
          c.id === action.id ? { ...c, resolution: action.resolution } : c,
        ),
      };
    case "RESOLVE_ALL":
      return {
        ...state,
        conflicts: state.conflicts.map((c) => ({
          ...c,
          resolution: action.resolution,
        })),
      };
    case "MERGE_CONFIRMED":
      return {
        ...state,
        components: action.components,
        relationships: action.relationships,
        reviewIds: action.reviewIds,
        conflicts: [],
        server: action.server,
      };
    case "REVIEW_REL":
      return {
        ...state,
        relationships: action.relationships,
        reviewIds: action.reviewIds,
      };
    case "BATCH_PATCH":
      return {
        ...state,
        batches: state.batches.map((b) =>
          b.id === action.batchId ? { ...b, ...action.patch } : b,
        ),
      };
    case "MIGRATE":
      return {
        ...state,
        batches: action.batches,
        components: action.components,
      };
    case "RESET":
      return action.state;
    default:
      return state;
  }
}

function seed(): PersistState {
  const now = Date.now();
  const t = (h: number) => now - h * 3600 * 1000;

  const batchA: DraftBatch = {
    id: uid(),
    label: "甲队 · 大雄宝殿测绘",
    team: "测绘甲队",
    status: "open",
    legacy: false,
    lastEditAt: t(1),
    createdAt: t(2),
    confirmedSeq: 0,
    total: 3,
  };

  const mk = (
    patch: Partial<ComponentRecord> & Pick<ComponentRecord, "code" | "tenon" | "section" | "diseaseLocation" | "deformation" | "suggestion">,
    hoursAgo: number,
    seq: number,
  ): ComponentRecord => ({
    id: uid(),
    building: "大雄宝殿",
    wood: "杉木",
    status: "active",
    batchId: batchA.id,
    seq,
    team: "测绘甲队",
    legacy: false,
    updatedAt: t(hoursAgo),
    createdAt: t(hoursAgo + 0.5),
    ...patch,
  });

  const beam = mk(
    {
      code: "梁架A-03",
      wood: "杉木",
      tenon: "透榫",
      section: "180x240mm",
      diseaseLocation: "梁端榫头",
      deformation: "端部开裂Ⅱ级",
      suggestion: "建议更换榫头",
    },
    1,
    1,
  );
  const col = mk(
    {
      code: "柱网C-12",
      wood: "楠木",
      tenon: "半榫",
      section: "柱径220mm",
      diseaseLocation: "柱脚",
      deformation: "糟朽深约30mm",
      suggestion: "建议局部墩接",
    },
    0.9,
    2,
  );
  const dou = mk(
    {
      code: "斗拱D-07",
      wood: "樟木",
      tenon: "半榫",
      section: "斗口120mm",
      diseaseLocation: "斗耳",
      deformation: "轻微变形",
      suggestion: "继续监测",
    },
    0.8,
    3,
  );
  const colA = mk(
    {
      code: "柱网A-01",
      wood: "楠木",
      tenon: "燕尾榫",
      section: "柱径200mm",
      diseaseLocation: "柱身",
      deformation: "未见明显变形",
      suggestion: "继续监测",
    },
    3,
    4,
  );

  // 老草稿：缺少批次标识，最后编辑时间在一天前
  const legacy: ComponentRecord = {
    id: uid(),
    code: "斗拱D-07",
    building: "大雄宝殿",
    wood: "樟木",
    tenon: "半榫",
    section: "斗口110mm",
    diseaseLocation: "斗耳",
    deformation: "轻微变形（老稿）",
    suggestion: "继续监测",
    status: "active",
    batchId: "",
    seq: 1,
    team: "",
    legacy: false,
    updatedAt: t(26),
    createdAt: t(27),
  };

  const components = [beam, col, dou, colA, legacy];

  const relationships: Relationship[] = [
    {
      id: uid(),
      fromId: beam.id,
      toId: colA.id,
      kind: "榫接",
      status: "valid",
      batchId: batchA.id,
      updatedAt: t(1),
    },
    {
      id: uid(),
      fromId: beam.id,
      toId: col.id,
      kind: "榫接",
      status: "valid",
      batchId: batchA.id,
      updatedAt: t(1),
    },
    {
      id: uid(),
      fromId: dou.id,
      toId: col.id,
      kind: "搭接连理",
      status: "valid",
      batchId: batchA.id,
      updatedAt: t(0.8),
    },
  ];

  // 服务器快照：较早的测量值，与本地草稿存在字段差异
  const server: ServerState = {
    components: [
      { ...beam, suggestion: "继续观察", deformation: "端部开裂Ⅰ级", updatedAt: t(3) },
      { ...col, suggestion: "建议更换柱脚", deformation: "糟朽深约25mm", updatedAt: t(3) },
      { ...colA, updatedAt: t(4) },
    ],
  };

  return {
    online: false,
    chaos: false,
    currentBatchId: batchA.id,
    batches: [batchA],
    components,
    relationships,
    conflicts: [],
    reviewIds: [],
    server,
    logs: [
      {
        id: uid(),
        time: now,
        kind: "info",
        text: "测绘台已就绪：当前为断网现场模式，测量结果先存入本地草稿。",
      },
    ],
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const seeded = seed();
    const loaded = loadState<PersistState>();
    return loaded ?? seeded;
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    saveState(state);
  }, [state]);

  const addLog = useCallback((text: string, kind: LogEntry["kind"] = "info") => {
    dispatch({ type: "ADD_LOG", entry: { id: uid(), time: Date.now(), text, kind } });
  }, []);

  const toggleOnline = useCallback(() => {
    const next = !stateRef.current.online;
    dispatch({ type: "SET_ONLINE", online: next });
    dispatch({
      type: "ADD_LOG",
      entry: {
        id: uid(),
        time: Date.now(),
        kind: next ? "info" : "warn",
        text: next
          ? "网络已恢复：可先合并本地草稿与服务器差异，确认后再更新建筑关系。"
          : "已进入断网模式：测量写入本地草稿，恢复网络后再合并上传。",
      },
    });
  }, []);

  const toggleChaos = useCallback(() => {
    dispatch({ type: "SET_CHAOS", chaos: !stateRef.current.chaos });
  }, []);

  const addComponent = useCallback(
    (input: Store["addComponent"] extends (i: infer I) => void ? I : never) => {
      const st = stateRef.current;
      // 找到该测绘队未完成的批次，没有就新建一个
      let batch = st.batches.find(
        (b) => b.team === input.team && !b.legacy && b.status !== "done",
      );
      if (!batch) {
        const now = Date.now();
        batch = {
          id: uid(),
          label: `${input.team || "未标注测绘队"} · ${fmtTime(now)}`,
          team: input.team || "未标注测绘队",
          status: "open",
          legacy: false,
          lastEditAt: now,
          createdAt: now,
          confirmedSeq: 0,
          total: 0,
        };
        dispatch({ type: "ADD_LOG", entry: { id: uid(), time: now, kind: "info", text: `已为${batch.team}新开批次 ${batch.label}。` } });
      }
      const seq = batch.total + 1;
      const now = Date.now();
      const component: ComponentRecord = {
        ...input,
        id: uid(),
        batchId: batch.id,
        seq,
        status: input.status ?? "active",
        legacy: false,
        updatedAt: now,
        createdAt: now,
      };
      dispatch({ type: "ADD_COMPONENT", component, batchId: batch.id });
      dispatch({ type: "SET_CURRENT_BATCH", batchId: batch.id });
      dispatch({
        type: "ADD_LOG",
        entry: {
          id: uid(),
          time: now,
          kind: "ok",
          text: `已写入本地草稿：${input.code}（批次 ${batch.label}，第 ${seq} 条）。`,
        },
      });
    },
    [],
  );

  const recomputeAndDispatch = useCallback(
    (components: ComponentRecord[], note: string) => {
      const st = stateRef.current;
      const { rels, affected } = recomputeRelationships(st.relationships, components);
      const reviewIds = Array.from(
        new Set([...st.reviewIds, ...affected.map((a) => a.relationshipId)]),
      );
      dispatch({ type: "SET_COMPONENTS", components, relationships: rels, reviewIds });
      dispatch({
        type: "ADD_LOG",
        entry: {
          id: uid(),
          time: Date.now(),
          kind: affected.length ? "warn" : "info",
          text: affected.length
            ? `${note}：${affected.length} 条关系失效，已列出受影响节点，审核后才恢复。`
            : `${note}：关系重算完成，无失效节点。`,
        },
      });
    },
    [],
  );

  const deactivate = useCallback(
    (id: string) => {
      const st = stateRef.current;
      const target = st.components.find((c) => c.id === id);
      if (!target) return;
      const components = st.components.map((c) =>
        c.id === id ? { ...c, status: "inactive" as const, updatedAt: Date.now() } : c,
      );
      recomputeAndDispatch(components, `构件 ${target.code} 已停用`);
    },
    [recomputeAndDispatch],
  );

  const replaceComponent = useCallback(
    (id: string) => {
      const st = stateRef.current;
      const target = st.components.find((c) => c.id === id);
      if (!target) return;
      const now = Date.now();
      const batchItems = st.components.filter((c) => c.batchId === target.batchId);
      const maxSeq = batchItems.reduce((m, c) => Math.max(m, c.seq), 0);
      const replacement: ComponentRecord = {
        ...target,
        id: uid(),
        code: `${target.code}-替`,
        status: "active",
        batchId: target.batchId,
        seq: maxSeq + 1,
        updatedAt: now,
        createdAt: now,
        replacedBy: undefined,
      };
      const components = st.components.map((c) =>
        c.id === id
          ? { ...c, status: "replaced" as const, replacedBy: replacement.id, updatedAt: now }
          : c,
      );
      components.push(replacement);
      const { rels, affected } = recomputeRelationships(st.relationships, components);
      const reviewIds = Array.from(new Set([...st.reviewIds, ...affected.map((a) => a.relationshipId)]));
      dispatch({ type: "SET_COMPONENTS", components, relationships: rels, reviewIds });
      dispatch({
        type: "BATCH_PATCH",
        batchId: target.batchId,
        patch: { total: batchItems.length + 1, lastEditAt: now },
      });
      dispatch({
        type: "ADD_LOG",
        entry: {
          id: uid(),
          time: now,
          kind: "warn",
          text: `构件 ${target.code} 已替换为 ${replacement.code}（批次序号 ${replacement.seq}），${affected.length} 条引用关系失效待审核。`,
        },
      });
    },
    [],
  );

  const runMerge = useCallback(() => {
    const st = stateRef.current;
    if (!st.online) {
      dispatch({
        type: "ADD_LOG",
        entry: { id: uid(), time: Date.now(), kind: "bad", text: "当前断网，无法合并差异。请先恢复网络。" },
      });
      return;
    }
    const conflicts = diffComponents(st.components, st.server.components);
    dispatch({ type: "SET_CONFLICTS", conflicts });
    dispatch({
      type: "ADD_LOG",
      entry: {
        id: uid(),
        time: Date.now(),
        kind: conflicts.length ? "warn" : "ok",
        text: conflicts.length
          ? `发现 ${conflicts.length} 项字段差异，请逐项确认；差异未确认前不会更新建筑关系。`
          : "本地草稿与服务器一致，无差异。",
      },
    });
  }, []);

  const resolveConflict = useCallback(
    (id: string, resolution: "local" | "server") => {
      dispatch({ type: "RESOLVE_CONFLICT", id, resolution });
    },
    [],
  );

  const resolveAll = useCallback((resolution: "local" | "server") => {
    dispatch({ type: "RESOLVE_ALL", resolution });
  }, []);

  const confirmMerge = useCallback(() => {
    const st = stateRef.current;
    if (st.conflicts.some((c) => c.resolution === "pending")) {
      dispatch({
        type: "ADD_LOG",
        entry: { id: uid(), time: Date.now(), kind: "bad", text: "还有差异未确认，暂不更新建筑关系。" },
      });
      return;
    }
    // 按选择应用：server 则回退本地字段；local 保留本地
    const components = st.components.map((c) => {
      const mine = st.conflicts.filter((cf) => cf.componentId === c.id);
      if (!mine.length) return c;
      const patch: Partial<ComponentRecord> = {};
      for (const cf of mine) {
        if (cf.resolution === "server") {
          (patch as Record<string, unknown>)[cf.field] = cf.serverValue;
        }
      }
      return { ...c, ...patch, updatedAt: Date.now() };
    });
    // 合并结果写入服务器（权威数据）
    const server: ServerState = { components };
    // 差异确认后才重算关系
    const { rels, affected } = recomputeRelationships(st.relationships, components);
    const reviewIds = affected.map((a) => a.relationshipId);
    dispatch({ type: "MERGE_CONFIRMED", components, relationships: rels, reviewIds, server });
    dispatch({
      type: "ADD_LOG",
      entry: {
        id: uid(),
        time: Date.now(),
        kind: reviewIds.length ? "warn" : "ok",
        text: `差异已全部确认并写入服务器；${reviewIds.length ? `${reviewIds.length} 条关系失效进入审核队列。` : "建筑关系已是最新。"}`,
      },
    });
  }, []);

  const reviewRel = useCallback((id: string, action: "restore" | "keep") => {
    const st = stateRef.current;
    let relationships = st.relationships;
    let restored = false;
    let rePointed = false;
    if (action === "restore") {
      relationships = relationships.map((r) => {
        if (r.id !== id) return r;
        const from = st.components.find((c) => c.id === r.fromId);
        const to = st.components.find((c) => c.id === r.toId);
        // 被引用构件已替换 → 关系改指替换件
        let toId = r.toId;
        if (to?.status === "replaced" && to.replacedBy) {
          toId = to.replacedBy;
          rePointed = true;
        }
        const toFinal = st.components.find((c) => c.id === toId);
        if (from?.status === "active" && toFinal?.status === "active") {
          restored = true;
          return { ...r, toId, status: "valid" as RelStatus, reason: undefined };
        }
        return r;
      });
      if (!restored) {
        dispatch({
          type: "ADD_LOG",
          entry: {
            id: uid(),
            time: Date.now(),
            kind: "warn",
            text: "构件尚未恢复在用，关系暂不能恢复；请先停用/替换处理或等待构件恢复后再审核。",
          },
        });
        return;
      }
    } else {
      relationships = relationships.map((r) =>
        r.id === id ? { ...r, status: "invalid" as RelStatus } : r,
      );
    }
    const reviewIds = st.reviewIds.filter((rid) => rid !== id);
    dispatch({ type: "REVIEW_REL", relationships, reviewIds });
    dispatch({
      type: "ADD_LOG",
      entry: {
        id: uid(),
        time: Date.now(),
        kind: action === "restore" ? "ok" : "warn",
        text:
          action === "restore"
            ? `关系已审核恢复${rePointed ? "（已改指替换构件）" : ""}。`
            : "关系保持失效，待构件恢复后可重新审核。",
      },
    });
  }, []);

  const uploadBatch = useCallback(async (batchId: string) => {
    const st = stateRef.current;
    const batch = st.batches.find((b) => b.id === batchId);
    if (!batch || batch.status === "uploading") return;
    const items = st.components
      .filter((c) => c.batchId === batchId)
      .sort((a, b) => a.seq - b.seq);

    dispatch({
      type: "BATCH_PATCH",
      batchId,
      patch: { status: "uploading", failReason: undefined },
    });
    dispatch({
      type: "ADD_LOG",
      entry: {
        id: uid(),
        time: Date.now(),
        kind: "info",
        text: `批次 ${batch.label} 开始上传：共 ${items.length} 条，从第 ${batch.confirmedSeq + 1} 条继续。`,
      },
    });

    const res = await pushBatch(batch, items, st.chaos, (confirmed) => {
      dispatch({ type: "BATCH_PATCH", batchId, patch: { confirmedSeq: confirmed } });
    });

    if (res.ok) {
      dispatch({
        type: "BATCH_PATCH",
        batchId,
        patch: { status: "done", confirmedSeq: res.confirmed, failReason: undefined },
      });
      dispatch({
        type: "ADD_LOG",
        entry: {
          id: uid(),
          time: Date.now(),
          kind: "ok",
          text: `批次 ${batch.label} 上传完成：新写入 ${res.written} 条，幂等跳过 ${items.length - res.written} 条，无重复。`,
        },
      });
    } else {
      dispatch({
        type: "BATCH_PATCH",
        batchId,
        patch: {
          status: res.confirmed > 0 ? "partial" : "failed",
          confirmedSeq: res.confirmed,
          failReason: res.reason,
        },
      });
      dispatch({
        type: "ADD_LOG",
        entry: {
          id: uid(),
          time: Date.now(),
          kind: "bad",
          text: `批次 ${batch.label} 上传失败：${res.reason}。已确认 ${res.confirmed} 条，可按原批次从断点重试。`,
        },
      });
    }
  }, []);

  const migrate = useCallback(() => {
    const st = stateRef.current;
    const { batches, components, migrated } = migrateLegacyDrafts(
      st.components,
      st.batches,
    );
    dispatch({ type: "MIGRATE", batches, components });
    dispatch({
      type: "ADD_LOG",
      entry: {
        id: uid(),
        time: Date.now(),
        kind: migrated ? "ok" : "info",
        text: migrated
          ? `老草稿补版完成：${migrated} 条记录已按最后编辑时间补批次标识，原记录仍可在档案中查询。`
          : "没有缺少批次标识的老草稿。",
      },
    });
  }, []);

  const resetAll = useCallback(() => {
    resetServer();
    const fresh = seed();
    dispatch({ type: "RESET", state: fresh });
  }, []);

  const value = useMemo<Store>(
    () => ({
      ...state,
      addLog,
      toggleOnline,
      toggleChaos,
      addComponent,
      deactivate,
      replaceComponent,
      runMerge,
      resolveConflict,
      resolveAll,
      confirmMerge,
      reviewRel,
      uploadBatch,
      migrate,
      resetAll,
    }),
    [
      state,
      addLog,
      toggleOnline,
      toggleChaos,
      addComponent,
      deactivate,
      replaceComponent,
      runMerge,
      resolveConflict,
      resolveAll,
      confirmMerge,
      reviewRel,
      uploadBatch,
      migrate,
      resetAll,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
