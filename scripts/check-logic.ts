// 纯逻辑走查：用 tsx 执行不了环境里没装 ts-node，改用 vite 已有 esbuild 临时转译
import { buildInitialState } from "../src/data/seed";
import { startMerge } from "../src/logic/engine";

// 直接在 JS 层构造 reducer 不方便（tsx），改为手工断言纯函数行为
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

const state = buildInitialState();
// 1. 初始存在一条无批次老草稿
const legacy = state.local.drafts[0];
assert(legacy.id === "draft-legacy-001", "种子含老草稿");
assert(legacy.batchId === undefined, "老草稿确实无批次标识");
assert(!!state.server.components["D-07"], "站端含 D-07 档案");

// 2. 构造若干离线草稿（乙组），模拟合并
const drafts: typeof state.local.drafts = [
  {
    ...structuredClone(legacy),
    id: "draft-d07",
    section: "118x162mm",
    diseaseLocation: "拱瓣磨损加深",
    deformation: "外倾9mm",
    state: "pending",
  },
];

// 老草稿无基线：字段与站端不同 => 全部冲突待人工
const merge = startMerge(
  {
    ...state,
    local: { ...state.local, drafts, bases: {}, baseRelations: null },
  },
  "乙组"
);
assert(merge.fieldDiffs.length >= 3, `无基线老草稿产生人工确认差异（${merge.fieldDiffs.length} 项）`);
assert(merge.fieldDiffs.every((d) => d.conflict), "老草稿差异全部标记为需确认冲突");

// 3. 有基线场景：只本地改 -> 自动取本地；双方改不同值 -> 冲突
const base = structuredClone(state.server.components["A-03"]);
const withBase = {
  ...state,
  local: {
    ...state.local,
    drafts: [
      {
        id: "draft-a03",
        team: "甲组",
        building: "大雄宝殿",
        componentId: "A-03",
        woodType: "榆木",
        jointType: "透榫" as const,
        section: "185x245mm", // 本地改
        diseaseLocation: "端部顺纹开裂 220mm",
        deformation: "跨中下挠 14mm",
        repairSuggestion: "端部箍固件+裂缝注胶",
        measuredAt: 1,
        updatedAt: 2,
        state: "pending" as const,
        baseRev: 1,
      },
      {
        id: "draft-p11",
        team: "甲组",
        building: "大雄宝殿",
        componentId: "P-11",
        woodType: "杉木",
        jointType: "燕尾榫" as const,
        section: "Φ220mm",
        diseaseLocation: "表面风蚀",
        deformation: "无明显变形",
        repairSuggestion: "表面防腐处理+新做", // 与下面站端冲突
        measuredAt: 1,
        updatedAt: 2,
        state: "pending" as const,
        baseRev: 1,
      },
    ],
    bases: { "A-03": base, "P-11": structuredClone(state.server.components["P-11"]) },
    baseRelations: structuredClone(state.server.relations),
    batches: {},
  },
};
// 模拟别组改了 P-11 的修缮建议
withBase.server = structuredClone(state.server);
withBase.server.components["P-11"].repairSuggestion = "别组定：墩接加铁箍";
const m2 = startMerge(withBase, "甲组");
const a03 = m2.fieldDiffs.filter((d) => d.componentId === "A-03");
const p11 = m2.fieldDiffs.filter((d) => d.componentId === "P-11");
assert(a03.some((d) => d.field === "section" && !d.conflict && d.resolution === "local"), "仅本地修改自动取本地");
assert(p11.some((d) => d.field === "repairSuggestion" && d.conflict && !d.resolution), "双方改不同值产生未决冲突");

console.log(`\n结果：${pass} 通过，${fail} 失败`);
if (fail) process.exit(1);
