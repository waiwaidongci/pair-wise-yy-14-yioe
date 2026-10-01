import type { AppState, Building, ComponentDoc, Draft, Relation } from "../types";

export const TEAMS = ["甲组", "乙组", "丙组"];

export const BUILDING = "大雄宝殿";

/** 单栋建筑的榫卯关系视图布局（单位：视图坐标） */
const building: Building = {
  name: BUILDING,
  nodes: [
    { id: "C-01", label: "前檐柱 C-01", kind: "column", x: 90, y: 300 },
    { id: "C-02", label: "金柱 C-02", kind: "column", x: 420, y: 300 },
    { id: "C-03", label: "后檐柱 C-03", kind: "column", x: 750, y: 300 },
    { id: "D-07", label: "斗拱 D-07", kind: "dougong", x: 90, y: 190 },
    { id: "D-08", label: "斗拱 D-08", kind: "dougong", x: 420, y: 190 },
    { id: "D-09", label: "斗拱 D-09", kind: "dougong", x: 750, y: 190 },
    { id: "A-03", label: "五架梁 A-03", kind: "beam", x: 420, y: 110 },
    { id: "P-11", label: "脊檩 P-11", kind: "purlin", x: 420, y: 38 },
  ],
};

const NOW = Date.UTC(2026, 8, 28, 9, 0, 0);
const min = (m: number) => NOW + m * 60_000;

function comp(
  id: string,
  label: string,
  _kind: Building["nodes"][number]["kind"],
  woodType: string,
  jointType: ComponentDoc["jointType"],
  section: string,
  diseaseLocation: string,
  deformation: string,
  repairSuggestion: string
): ComponentDoc {
  return {
    id,
    building: BUILDING,
    name: label,
    woodType,
    jointType,
    section,
    diseaseLocation,
    deformation,
    repairSuggestion,
    status: "active",
    updatedAt: min(-40),
    rev: 1,
  };
}

export const SEED_COMPONENTS: ComponentDoc[] = [
  comp("C-01", "前檐柱", "column", "楠木", "透榫", "Φ300mm", "柱脚糟朽 120mm", "柱身向南倾斜 18mm", "建议局部墩接，重做柱顶榫"),
  comp("C-02", "金柱", "column", "楠木", "箍头榫", "Φ340mm", "无明显病害", "基本无变形", "继续监测"),
  comp("C-03", "后檐柱", "column", "松木", "透榫", "Φ300mm", "榫头端部开裂 60mm", "轻微沉降 6mm", "端部碳纤维加固后复测"),
  comp("D-07", "斗拱", "dougong", "柏木", "半榫", "120×160mm", "拱瓣磨损", "轻微外倾", "继续监测"),
  comp("D-08", "斗拱", "dougong", "柏木", "半榫", "120×160mm", "无", "无", "常规保养"),
  comp("D-09", "斗拱", "dougong", "柏木", "燕尾榫", "120×160mm", "卯口扩大", "下沉 8mm", "更换暗销，归安"),
  comp("A-03", "五架梁", "beam", "榆木", "透榫", "180×240mm", "端部顺纹开裂 220mm", "跨中下挠 14mm", "端部箍固件+裂缝注胶"),
  comp("P-11", "脊檩", "purlin", "杉木", "燕尾榫", "Φ220mm", "表面风蚀", "无明显变形", "表面防腐处理"),
];

export const SEED_RELATIONS: Relation[] = [
  { id: "R-01", building: BUILDING, from: "C-01", to: "D-07", joint: "透榫", valid: true, archived: false },
  { id: "R-02", building: BUILDING, from: "C-02", to: "D-08", joint: "箍头榫", valid: true, archived: false },
  { id: "R-03", building: BUILDING, from: "C-03", to: "D-09", joint: "透榫", valid: true, archived: false },
  { id: "R-04", building: BUILDING, from: "D-08", to: "A-03", joint: "半榫", valid: true, archived: false },
  { id: "R-05", building: BUILDING, from: "A-03", to: "P-11", joint: "透榫", valid: true, archived: false },
];

/** 预置一条老格式草稿：缺批次标识，启动后按最后编辑时间补版，原记录留档 */
export const LEGACY_DRAFT: Draft = {
  id: "draft-legacy-001",
  team: "乙组",
  building: BUILDING,
  componentId: "D-07",
  woodType: "柏木",
  jointType: "半榫",
  section: "118×162mm",
  diseaseLocation: "拱瓣磨损加深，卯口松动",
  deformation: "向南外倾 9mm",
  repairSuggestion: "建议加暗销并归安",
  measuredAt: min(-130),
  updatedAt: min(-95),
  state: "pending",
  baseRev: 0,
  note: "老版测绘宝导出（无批次号）",
};

export function buildInitialState(): AppState {
  const components: Record<string, ComponentDoc> = {};
  for (const c of SEED_COMPONENTS) components[c.id] = { ...c };
  return {
    online: true,
    activeTeam: TEAMS[0],
    buildings: [building],
    server: { rev: 1, components, relations: SEED_RELATIONS.map((r) => ({ ...r })), measurements: [] },
    local: { drafts: [structuredClone(LEGACY_DRAFT)], batches: {}, bases: {}, baseRelations: null },
    merge: null,
    reviews: [],
    history: [
      {
        id: "h-seed",
        at: min(-300),
        team: "站端",
        kind: "system",
        summary: "载入大雄宝殿既有测绘档案 8 构件 / 5 条榫卯关系",
      },
    ],
    failAt: 0,
    notices: [],
  };
}
