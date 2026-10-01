import type {
  AppState,
  ComponentDoc,
  Draft,
  FieldDiff,
  MergeSession,
  Relation,
  RelationDiff,
} from "../types";

export const FIELDS: { key: keyof ComponentDoc; label: string }[] = [
  { key: "jointType", label: "榫卯类型" },
  { key: "woodType", label: "木材种类" },
  { key: "section", label: "截面尺寸" },
  { key: "diseaseLocation", label: "病害位置" },
  { key: "deformation", label: "变形情况" },
  { key: "repairSuggestion", label: "修缮建议" },
];

let seq = 0;
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export const val = (c: Partial<ComponentDoc> | undefined, key: string): string =>
  c == null ? "" : String((c as Record<string, unknown>)[key] ?? "");

export const statusText = (c: ComponentDoc | undefined): string => {
  if (!c) return "站端无此构件";
  if (c.status === "active") return "在用";
  if (c.status === "deactivated") return "已停用";
  return `已替换 → ${c.replacedBy ?? "?"}`;
};

/** 与某构件直接相连的有效关系（该构件被引用时需要失效重算的边） */
export function edgesTouching(relations: Relation[], componentId: string): Relation[] {
  return relations.filter((r) => !r.archived && (r.from === componentId || r.to === componentId));
}

/** 受影响节点：失效边两端构件的并集 */
export function affectedNodeIds(relations: Relation[], edges: Relation[]): string[] {
  const ids = new Set<string>();
  for (const e of edges) {
    ids.add(e.from);
    ids.add(e.to);
  }
  // 再向外扩一度：让测绘员看到牵连范围
  for (const id of [...ids]) {
    for (const e of relations) {
      if (e.archived) continue;
      if (e.from === id) ids.add(e.to);
      if (e.to === id) ids.add(e.from);
    }
  }
  return [...ids];
}

interface LocalProposal {
  draft: Draft;
  action?: Draft["statusAction"];
}

/** 每个构件取本批次内最后编辑的草稿作为本地提案 */
function latestByComponent(drafts: Draft[]): Map<string, LocalProposal> {
  const map = new Map<string, LocalProposal>();
  const sorted = [...drafts].sort((a, b) => a.updatedAt - b.updatedAt);
  for (const d of sorted) map.set(d.componentId, { draft: d, action: d.statusAction });
  return map;
}

function statusProposalText(action: NonNullable<Draft["statusAction"]>): string {
  return action.type === "deactivate" ? "停用" : `替换为 ${action.targetId}`;
}

/** 构造字段级差异（三路：断网基线 / 本地草稿 / 站端最新） */
export function buildFieldDiffs(state: AppState, drafts: Draft[]): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const proposals = latestByComponent(drafts);

  for (const { draft, action } of proposals.values()) {
    const id = draft.componentId;
    const base = state.local.bases[id];
    const remote = state.server.components[id];
    const label = remote ? `${remote.name} ${id}` : `新构件 ${id}`;

    for (const { key, label: fl } of FIELDS) {
      const b = val(base, key);
      const l = val(draft, key);
      const r = val(remote, key);
      if (l === r && (base === undefined || l === b)) continue; // 完全一致无需差异

      if (base === undefined) {
        // 无共同基线（老草稿 / 断网前不在档案里）：只要本地与站端不同就人工确认
        if (l === r) continue;
        diffs.push({
          key: `${id}.${key}`,
          componentId: id,
          componentLabel: label,
          field: key,
          fieldLabel: fl,
          base: b,
          local: l,
          remote: r,
          conflict: true,
          kind: remote ? "changed" : "new-local",
        });
        continue;
      }

      const localChanged = l !== b;
      const remoteChanged = r !== b;
      if (!localChanged && !remoteChanged) continue;

      if (localChanged && !remoteChanged) {
        diffs.push({ key: `${id}.${key}`, componentId: id, componentLabel: label, field: key, fieldLabel: fl, base: b, local: l, remote: r, conflict: false, resolution: "local", auto: true, kind: "changed" });
      } else if (!localChanged && remoteChanged) {
        diffs.push({ key: `${id}.${key}`, componentId: id, componentLabel: label, field: key, fieldLabel: fl, base: b, local: l, remote: r, conflict: false, resolution: "remote", auto: true, kind: "changed" });
      } else if (l === r) {
        diffs.push({ key: `${id}.${key}`, componentId: id, componentLabel: label, field: key, fieldLabel: fl, base: b, local: l, remote: r, conflict: false, resolution: "local", auto: true, kind: "changed" });
      } else {
        diffs.push({ key: `${id}.${key}`, componentId: id, componentLabel: label, field: key, fieldLabel: fl, base: b, local: l, remote: r, conflict: true, kind: "changed" });
      }
    }

    if (action) {
      const baseText = base ? statusText(base) : "";
      const remoteText = statusText(remote);
      const localText = statusText(remote) === "在用" ? statusProposalText(action) : `${statusText(remote)} / 本地提案:${statusProposalText(action)}`;
      const conflict = !!remote && remote.status !== "active";
      diffs.push({
        key: `${id}.__status__`,
        componentId: id,
        componentLabel: label,
        field: "__status__",
        fieldLabel: "构件状态",
        base: baseText,
        local: localText,
        remote: remoteText,
        conflict,
        kind: "status",
        resolution: conflict ? undefined : "local",
        auto: !conflict,
      });
    }
  }
  return diffs;
}

const relValue = (r: Relation | undefined): string =>
  r ? (r.archived ? "已归档" : r.valid ? `${r.joint} · 有效` : `${r.joint} · 失效`) : "（无此关系）";

export function localRelationView(state: AppState, drafts: Draft[]): Map<string, Relation> {
  const baseRelations = state.local.baseRelations ?? state.server.relations;
  const proposals = latestByComponent(drafts);
  const locallyDead = new Set<string>();
  proposals.forEach((p, id) => {
    if (p.action) locallyDead.add(id);
  });

  const view = new Map<string, Relation>();
  for (const r of baseRelations) {
    if (r.archived) continue;
    const ownerProposal = proposals.get(r.from);
    const joint = ownerProposal ? ownerProposal.draft.jointType : r.joint;
    const dead = locallyDead.has(r.from) || locallyDead.has(r.to);
    view.set(r.id, { ...r, joint, valid: !dead });
  }
  return view;
}

/** 榫卯关系差异：以断网时关系为基线，比较本地提案与站端现状 */
export function buildRelationDiffs(state: AppState, drafts: Draft[]): RelationDiff[] {
  const baseRelations = state.local.baseRelations ?? state.server.relations;
  const diffs: RelationDiff[] = [];

  const localView = localRelationView(state, drafts);


  const all = new Map<string, Relation>();
  for (const r of baseRelations) if (!r.archived) all.set(r.id, r);
  for (const r of state.server.relations) if (!r.archived) all.set(r.id, r);

  for (const id of all.keys()) {
    const b = baseRelations.find((r) => r.id === id);
    const l = localView.get(id);
    const r = state.server.relations.find((x) => x.id === id && !x.archived);
    const bv = relValue(b);
    const lv = relValue(l);
    const rv = relValue(r);
    if (lv === rv && lv === bv) continue;

    const edge = b ?? l ?? r!;
    const localChanged = lv !== bv;
    const remoteChanged = rv !== bv;
    const bothDiff = localChanged && remoteChanged && lv !== rv;

    diffs.push({
      key: id,
      relationId: id,
      from: edge.from,
      to: edge.to,
      label: `${edge.from} ⇢ ${edge.to}`,
      base: bv,
      local: lv,
      remote: rv,
      conflict: bothDiff,
      resolution: bothDiff ? undefined : localChanged ? "local" : "remote",
      auto: !bothDiff,
    });
  }
  return diffs;
}

export function startMerge(state: AppState, team: string): MergeSession {
  const drafts = state.local.drafts.filter((d) => d.team === team && d.state === "pending");
  const batches = Object.values(state.local.batches).filter(
    (b) => b.team === team && (b.status === "queueing" || b.status === "failed")
  );
  return {
    id: uid("merge"),
    team,
    batchIds: batches.map((b) => b.id),
    fieldDiffs: buildFieldDiffs(state, drafts),
    relationDiffs: buildRelationDiffs(state, drafts),
    stage: "fields",
    createdAt: Date.now(),
  };
}

export const unresolved = (d: { conflict: boolean; resolution?: string }) =>
  d.conflict && !d.resolution;

/**
 * 构件停用/替换或榫卯类型变更后，重算相关关系：
 * - 端点非在用 → 关系失效
 * - 归属构件榫卯类型变化 → 关系随动改型并标失效，等审核恢复
 * 返回失效边（含旧类型信息用于审核单）与受影响节点。
 */
export function recomputeAfterComponentChange(
  components: Record<string, ComponentDoc>,
  relations: Relation[],
  touchedComponentIds: string[]
): { relations: Relation[]; invalidEdges: Relation[]; affected: string[] } {
  const touched = new Set(touchedComponentIds);
  const stale: Relation[] = [];

  const next = relations.map((r) => {
    if (r.archived || !(touched.has(r.from) || touched.has(r.to))) return r;
    const from = components[r.from];
    const to = components[r.to];
    if (!from || !to || from.status !== "active" || to.status !== "active") {
      const c = !from || from.status !== "active" ? from : to;
      stale.push(r);
      return { ...r, valid: false, reason: `端点构件${c ? statusText(c) : "缺失"}，榫卯关系失效待审` };
    }
    if (from.jointType !== r.joint) {
      stale.push(r);
      return { ...r, valid: false, reason: `归属构件榫卯已改为${from.jointType}，关系重算待审` };
    }
    return r;
  });

  return { relations: next, invalidEdges: stale, affected: affectedNodeIds(next, stale) };
}
