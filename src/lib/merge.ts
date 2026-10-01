// 差异合并与关系重算
import type {
  AffectedNode,
  ComponentRecord,
  ConflictItem,
  Relationship,
} from "../types";

export const FIELD_LABELS: Record<string, string> = {
  code: "构件编号",
  building: "建筑名称",
  wood: "木材种类",
  tenon: "榫卯类型",
  section: "截面尺寸",
  diseaseLocation: "病害位置",
  deformation: "变形情况",
  suggestion: "修缮建议",
};

export const MERGE_FIELDS = [
  "code",
  "building",
  "wood",
  "tenon",
  "section",
  "diseaseLocation",
  "deformation",
  "suggestion",
] as const;

/** 字段级双向 diff：本地草稿 vs 服务器快照 */
export function diffComponents(
  local: ComponentRecord[],
  server: ComponentRecord[],
): ConflictItem[] {
  const serverById = new Map(server.map((c) => [c.id, c]));
  const conflicts: ConflictItem[] = [];

  for (const l of local) {
    const s = serverById.get(l.id);
    if (!s) continue; // 本地新增构件，无差异
    for (const field of MERGE_FIELDS) {
      const lv = String(l[field] ?? "");
      const sv = String(s[field] ?? "");
      if (lv !== sv) {
        conflicts.push({
          id: `${l.id}:${field}`,
          batchId: l.batchId,
          componentId: l.id,
          code: l.code,
          field,
          label: FIELD_LABELS[field] ?? field,
          localValue: lv,
          serverValue: sv,
          resolution: "pending",
        });
      }
    }
  }
  return conflicts;
}

/**
 * 重算构件关系：构件停用/替换后，引用它的关系失效；
 * 构件恢复后关系进入待审核，人工确认后才恢复。
 */
export function recomputeRelationships(
  rels: Relationship[],
  components: ComponentRecord[],
): { rels: Relationship[]; affected: AffectedNode[] } {
  const byId = new Map(components.map((c) => [c.id, c]));
  const affected: AffectedNode[] = [];

  const next = rels.map((r) => {
    const from = byId.get(r.fromId);
    const to = byId.get(r.toId);

    if (!from || from.status !== "active") {
      const reason = !from
        ? "源构件已删除"
        : from.status === "inactive"
          ? "源构件已停用"
          : "源构件已替换";
      affected.push({
        relationshipId: r.id,
        fromId: r.fromId,
        fromCode: from?.code ?? "?",
        toId: r.toId,
        toCode: to?.code ?? "?",
        reason,
      });
      return { ...r, status: "invalid" as const, reason };
    }
    if (!to || to.status !== "active") {
      const reason = !to
        ? "被引用构件已删除"
        : to.status === "inactive"
          ? "被引用构件已停用"
          : "被引用构件已替换";
      affected.push({
        relationshipId: r.id,
        fromId: r.fromId,
        fromCode: from.code,
        toId: r.toId,
        toCode: to?.code ?? "?",
        reason,
      });
      return { ...r, status: "invalid" as const, reason };
    }
    if (r.status === "invalid") {
      // 两端都已恢复，但关系不自动生效，需审核
      return {
        ...r,
        status: "pending-review" as const,
        reason: "构件已恢复，待审核确认关系",
      };
    }
    return r;
  });

  return { rels: next, affected };
}
