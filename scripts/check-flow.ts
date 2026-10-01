import { buildInitialState } from "../src/data/seed";
import { __testing } from "../src/store";
import type { AppState, Draft, JointType } from "../src/types";

const { reducer, migrateLegacy } = __testing as {
  reducer: (s: AppState, a: any) => AppState;
  migrateLegacy: (s: AppState) => AppState;
};

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.error("  ✗", msg);
  }
}

function draftInput(over: Partial<{
  componentId: string;
  jointType: JointType;
  section: string;
  diseaseLocation: string;
  deformation: string;
  repairSuggestion: string;
  woodType: string;
  statusAction: Draft["statusAction"];
}> = {}) {
  return {
    building: "大雄宝殿",
    componentId: "A-03",
    woodType: "榆木",
    jointType: "透榫" as JointType,
    section: "180×240mm",
    diseaseLocation: "无",
    deformation: "无",
    repairSuggestion: "继续监测",
    measuredAt: 1760000000000,
    ...over,
  };
}

// ============ 1. 老草稿补版：原记录可查 ============
{
  console.log("① 老草稿缺批次号 → 按最后编辑时间补版，原记录留档");
  const s0 = buildInitialState();
  const s = migrateLegacy(s0);
  const d = s.local.drafts[0];
  assert(d.backfilled === true, "草稿标记为补版");
  assert(d.batchId === "B-补版-20260928", `批次号按最后编辑时间生成（${d.batchId}）`);
  assert(!!s.local.batches[d.batchId!], "补版批次已建立");
  const h = s.history.find((x) => x.kind === "legacy");
  assert(!!h, "履历中留档");
  const snap = h!.snapshot as Draft;
  assert(snap.batchId === undefined, "留档快照仍是无批次号的原记录");
}

// ============ 2. 全链路：断网草稿 → 别组冲突 → 合并 → 关系失效重算 → 审核 ============
{
  console.log("② 断网录入 + 别组抢改 + 三路合并 + 停用失效重算 + 审核恢复");
  let s = buildInitialState();
  // 初始状态清掉老草稿，避免干扰本场景
  s = { ...s, local: { ...s.local, drafts: [] } };

  // 甲组断网
  s = reducer(s, { type: "setTeam", team: "甲组" });
  s = reducer(s, { type: "toggleOnline" });
  assert(s.online === false, "已断网");
  assert(Object.keys(s.local.bases).length === 8, "断网瞬间冻结构件基线");

  // 离线测 A-03（榫卯改燕尾 + 变形复测，本地侧改动）和 C-03（含停用提案）
  s = reducer(s, {
    type: "saveDraft",
    input: draftInput({ componentId: "A-03", jointType: "燕尾榫", deformation: "跨中下挠 18mm" }),
  });
  s = reducer(s, {
    type: "saveDraft",
    input: draftInput({ componentId: "C-03", woodType: "松木", jointType: "透榫", statusAction: { type: "deactivate" } }),
  });
  const draftsOffline = s.local.drafts;
  assert(draftsOffline.length === 2 && draftsOffline.every((d) => d.state === "pending"), "两条离线草稿待合并");
  const batchId = draftsOffline[0].batchId!;
  assert(draftsOffline[1].batchId === batchId, "两条草稿同属一个离线批次");

  // 别组回站改 A-03（冲突）、补 P-11（仅站端改）
  s = reducer(s, { type: "simRemote", kind: "joint" });
  s = reducer(s, { type: "simRemote", kind: "disease" });
  assert(s.server.components["A-03"].jointType === "箍头榫", "别组把 A-03 榫卯改判为箍头榫");

  // 恢复联网并开始合并
  s = reducer(s, { type: "toggleOnline" });
  s = reducer(s, { type: "beginMerge" });
  assert(!!s.merge, "合并会话已建立");

  // 字段差异：A-03 榫卯双方改 → 冲突；变形仅本地改自动取本地；截面仅站端改自动取站端
  const fd = s.merge!.fieldDiffs;
  const jointConflict = fd.find((d) => d.componentId === "A-03" && d.field === "jointType");
  const deformDiff = fd.find((d) => d.componentId === "A-03" && d.field === "deformation");
  const sectionDiff = fd.find((d) => d.componentId === "A-03" && d.field === "section");
  assert(!!jointConflict && jointConflict.conflict && !jointConflict.resolution, "A-03 榫卯为未决冲突");
  assert(!!deformDiff && deformDiff.resolution === "local" && deformDiff.auto, "A-03 变形仅本地改，自动取本地");
  assert(!!sectionDiff && sectionDiff.resolution === "remote" && sectionDiff.auto, "A-03 截面仅站端改，自动取站端");
  assert(!fd.some((d) => d.componentId === "P-11"), "未触碰的 P-11 不产生合并项（别组值已在站端，不被覆盖）");

  // 不允许未决就确认
  const beforeConfirm = s;
  s = reducer(s, { type: "confirmFields" });
  assert(s === beforeConfirm, "存在未决冲突时无法确认字段");

  // 冲突选择本地（坚持透榫），其余自动项不变
  s = reducer(s, { type: "resolveField", key: jointConflict!.key, resolution: "local" });
  // C-03 停用状态差异（站端仍在用）自动取本地
  s = reducer(s, { type: "confirmFields" });
  assert(s.merge!.stage === "relations", "字段确认完成，进入关系阶段；此时站端关系尚未更新");
  assert(s.server.relations.find((r) => r.id === "R-03")!.valid === true, "关系在关系确认前不失效");

  // 关系差异：R-05 本地透榫 vs 站端箍头榫 → 冲突；R-03 本地停用导致失效 vs 站端有效
  const rd = s.merge!.relationDiffs;
  const r05 = rd.find((d) => d.relationId === "R-05");
  const r03 = rd.find((d) => d.relationId === "R-03");
  assert(!!r05 && r05.conflict, "R-05 榫卯关系冲突");
  assert(!!r03 && r03.local.includes("失效"), "R-03 本地视图已失效");
  s = reducer(s, { type: "resolveRelation", key: r05!.key, resolution: "local" });
  s = reducer(s, { type: "resolveRelation", key: r03!.key, resolution: "local" });
  s = reducer(s, { type: "confirmRelations" });
  assert(s.merge === null || s.merge!.stage === "done", "全部差异确认完成");

  // 关系更新：A-03 仍在用透榫，R-05 保持有效；C-03 停用 → R-03 失效待审
  const R05 = s.server.relations.find((r) => r.id === "R-05")!;
  const R03 = s.server.relations.find((r) => r.id === "R-03")!;
  assert(R05.valid && R05.joint === "燕尾榫", "R-05 按本地裁决取燕尾榫并保持有效（别组的箍头榫未覆盖）");
  assert(!R03.valid, "C-03 停用后 R-03 失效");
  const rv = s.reviews.find((x) => x.relationId === "R-03" && x.status === "pending");
  assert(!!rv, "R-03 生成待审核单");
  assert(rv!.affectedNodeIds.includes("C-03") && rv!.affectedNodeIds.includes("D-09"), `受影响节点包含两端（${rv!.affectedNodeIds.join("、")}）`);

  // 草稿转 confirmed、批次 ready
  assert(s.local.drafts.every((d) => d.state === "confirmed"), "草稿转为已确认待上传");
  assert(s.local.batches[batchId].status === "ready", "批次进入待上传");

  // 停用状态下审核不允许恢复
  s = reducer(s, { type: "review", id: rv!.id, decision: "approved" });
  assert(s.reviews.find((x) => x.id === rv!.id)!.status === "pending", "端点停用中，审核恢复被拒绝");

  // 模拟 C-03 恢复在用（墩接完成）：直接用在线操作无法"激活"，改用站端恢复场景——
  // 通过别组场景不容易，这里验证驳回归档分支
  const rejectId = rv!.id;
  s = reducer(s, { type: "review", id: rejectId, decision: "rejected" });
  assert(s.server.relations.find((r) => r.id === "R-03")!.archived === true, "审核驳回后关系归档");
  assert(s.reviews.find((x) => x.id === rejectId)!.status === "rejected", "审核单状态为驳回");
}

// ============ 3. 在线停用 → 审核通过恢复 ============
{
  console.log("③ 在线停用：立即失效重算；端点恢复在用后审核通过才恢复");
  let s = buildInitialState();
  s = { ...s, local: { ...s.local, drafts: [] } };
  s = reducer(s, { type: "setTeam", team: "甲组" });

  s = reducer(s, { type: "componentActionOnline", componentId: "D-09", action: { type: "deactivate" } });
  const R03 = s.server.relations.find((r) => r.id === "R-03")!;
  assert(!R03.valid, "D-09 停用 → R-03 立即失效");
  const rv = s.reviews.find((x) => x.relationId === "R-03" && x.status === "pending")!;
  assert(!!rv, "生成审核单");

  // 端点恢复在用（模拟墩接归安后构件复用）
  s.server.components["D-09"].status = "active";
  s = reducer(s, { type: "review", id: rv.id, decision: "approved" });
  assert(s.server.relations.find((r) => r.id === "R-03")!.valid === true, "审核通过后关系恢复");
  assert(s.reviews.find((x) => x.id === rv.id)!.status === "approved", "审核单已通过");
}

// ============ 4. 上传失败 → 原批次重试，从最后确认构件继续，不重复 ============
{
  console.log("④ 上传中断点续传：已写入测量不重复");
  let s = buildInitialState();
  s = { ...s, local: { ...s.local, drafts: [] } };
  s = reducer(s, { type: "setTeam", team: "丙组" });
  s = reducer(s, { type: "toggleOnline" });

  // 三条离线草稿
  s = reducer(s, { type: "saveDraft", input: draftInput({ componentId: "A-03", section: "1×1mm" }) });
  s = reducer(s, { type: "saveDraft", input: draftInput({ componentId: "P-11", section: "2×2mm" }) });
  s = reducer(s, { type: "saveDraft", input: draftInput({ componentId: "D-07", section: "3×3mm" }) });
  const batchId = s.local.drafts[0].batchId!;

  s = reducer(s, { type: "toggleOnline" });
  s = reducer(s, { type: "beginMerge" });
  // 无字段冲突（截面改动在无基线? — 有冻结基线，仅本地改 → 自动）
  s = reducer(s, { type: "confirmFields" });
  s = reducer(s, { type: "confirmRelations" });
  assert(s.local.batches[batchId].status === "ready", "合并后批次待上传");

  // 挂失败点：第 2 条失败
  s = reducer(s, { type: "setFailAt", n: 2 });
  s = reducer(s, { type: "uploadBatch", batchId });
  const batch = s.local.batches[batchId];
  assert(batch.status === "failed", "批次标记失败");
  assert(batch.cursor === 1, `游标停在 1（${batch.cursor}）`);
  assert(batch.lastComponentId === "A-03", `最后确认构件 A-03（${batch.lastComponentId}）`);
  assert(s.server.measurements.length === 1, "仅 1 条测量写入站端");

  // 原批次重试：不挂失败点，从游标继续
  s = reducer(s, { type: "uploadBatch", batchId });
  assert(s.local.batches[batchId].status === "uploaded", "重试后批次完成");
  assert(s.server.measurements.length === 3, `站端共 3 条测量（${s.server.measurements.length}），无重复`);
  const ids = s.server.measurements.map((m) => m.id);
  assert(new Set(ids).size === 3, "测量 id 无重复");

  // 再次重试（幂等）：不新增
  s.local.batches[batchId].status = "failed"; // 人为制造重试入口
  s = reducer(s, { type: "uploadBatch", batchId });
  assert(s.server.measurements.length === 3, "重复重试不产生重复测量");
}

// ============ 5. 在线直接入库也写草稿与批次 ============
{
  console.log("⑤ 在线测量直接入库，本地仍保留可查草稿");
  let s = buildInitialState();
  s = { ...s, local: { ...s.local, drafts: [] } };
  s = reducer(s, { type: "setTeam", team: "甲组" });
  s = reducer(s, { type: "saveDraft", input: draftInput({ componentId: "C-02", section: "Φ342mm" }) });
  assert(s.server.measurements.length === 1, "在线测量已入库");
  const d = s.local.drafts[0];
  assert(d.state === "written", "本地草稿标记已写入并保留");
  assert(s.local.batches[d.batchId!].status === "uploaded", "在线批次标记已上传");
  assert(s.server.components["C-02"].section === "Φ342mm", "构件档案已更新");
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
if (fail) process.exit(1);
