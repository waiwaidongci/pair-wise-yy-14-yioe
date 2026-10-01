// 老草稿迁移：缺少批次标识的草稿，按最后编辑时间补一版，
// 原记录保留可查（不删除、不覆盖）。
import type { ComponentRecord, DraftBatch } from "../types";
import { fmtTime } from "./utils";

export function migrateLegacyDrafts(
  components: ComponentRecord[],
  batches: DraftBatch[],
): { batches: DraftBatch[]; components: ComponentRecord[]; migrated: number } {
  const noBatch = components.filter((c) => !c.batchId);
  if (noBatch.length === 0) return { batches, components, migrated: 0 };

  // 按最后编辑时间分组，每个时间点补一个版本批次
  const groups = new Map<number, ComponentRecord[]>();
  for (const c of noBatch) {
    const t = c.updatedAt;
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t)!.push(c);
  }

  const nextBatches = [...batches];
  const nextComponents = [...components];
  let migrated = 0;

  for (const [t, items] of groups) {
    const id = `LEGACY-${t}`;
    if (nextBatches.some((b) => b.id === id)) continue;
    nextBatches.push({
      id,
      label: `老草稿补版 · ${fmtTime(t)}`,
      team: "未标注测绘队",
      status: "open",
      legacy: true,
      lastEditAt: t,
      createdAt: Date.now(),
      confirmedSeq: 0,
      total: items.length,
    });
    for (const it of items) {
      const idx = nextComponents.findIndex((c) => c.id === it.id);
      if (idx >= 0) {
        nextComponents[idx] = { ...it, batchId: id, legacy: true };
        migrated++;
      }
    }
  }

  return { batches: nextBatches, components: nextComponents, migrated };
}
