// 古建木结构测绘台 —— 领域模型

export const JOINT_TYPES = ["燕尾榫", "透榫", "半榫", "箍头榫"] as const;
export type JointType = (typeof JOINT_TYPES)[number];

export const WOOD_TYPES = ["楠木", "松木", "柏木", "杉木", "榆木"] as const;

export type ComponentStatus = "active" | "deactivated" | "replaced";

/** 建筑关系（榫卯连接） */
export interface Relation {
  id: string;
  building: string;
  /** 榫卯归属构件（关系随该构件的榫卯类型而定） */
  from: string;
  to: string;
  joint: JointType;
  valid: boolean;
  archived: boolean;
  reason?: string;
}

/** 站端构件档案 */
export interface ComponentDoc {
  id: string; // 构件编号
  building: string;
  name: string; // 显示名
  woodType: string;
  jointType: JointType;
  section: string; // 截面尺寸 180×240mm
  diseaseLocation: string; // 病害位置
  deformation: string; // 变形情况
  repairSuggestion: string; // 修缮建议
  status: ComponentStatus;
  replacedBy?: string;
  updatedAt: number;
  rev: number;
}

/** 一次测量（站端入库后的不可修改记录，幂等键 = 草稿 id） */
export interface Measurement {
  id: string;
  batchId: string;
  team: string;
  building: string;
  componentId: string;
  woodType: string;
  jointType: JointType;
  section: string;
  diseaseLocation: string;
  deformation: string;
  repairSuggestion: string;
  measuredAt: number;
  writtenAt: number;
}

export type DraftState = "pending" | "confirmed" | "written" | "skipped";

/** 停用/替换提案（离线时挂在草稿上随批次提交） */
export interface StatusAction {
  type: "deactivate" | "replace";
  targetId?: string; // 替换后的新构件编号
}

/** 本地草稿：保留每次测量 */
export interface Draft {
  id: string;
  batchId?: string; // 老草稿可能缺失，迁移时按最后编辑时间补版
  backfilled?: boolean;
  team: string;
  building: string;
  componentId: string;
  woodType: string;
  jointType: JointType;
  section: string;
  diseaseLocation: string;
  deformation: string;
  repairSuggestion: string;
  measuredAt: number;
  updatedAt: number;
  state: DraftState;
  baseRev: number;
  statusAction?: StatusAction;
  note?: string;
}

export type BatchStatus =
  | "queueing" // 离线攒批中
  | "ready" // 差异已确认，等待上传
  | "uploading"
  | "failed"
  | "uploaded";

export interface Batch {
  id: string;
  team: string;
  createdAt: number;
  status: BatchStatus;
  draftIds: string[];
  cursor: number; // 已写入条数（断点）
  lastComponentId?: string; // 最后确认/写入的构件
  failCount: number;
}

/** 字段级差异（三路合并：基线 / 本地 / 站端） */
export interface FieldDiff {
  key: string;
  componentId: string;
  componentLabel: string;
  field: string;
  fieldLabel: string;
  base: string;
  local: string;
  remote: string;
  conflict: boolean; // 双方都改且不同
  kind: "changed" | "new-local" | "new-remote" | "status";
  resolution?: "local" | "remote";
  auto?: boolean;
}

export interface RelationDiff {
  key: string;
  relationId: string;
  from: string;
  to: string;
  label: string;
  base: string;
  local: string;
  remote: string;
  conflict: boolean;
  resolution?: "local" | "remote";
  auto?: boolean;
}

export type MergeStage = "fields" | "relations" | "done";

export interface MergeSession {
  id: string;
  team: string;
  batchIds: string[];
  fieldDiffs: FieldDiff[];
  relationDiffs: RelationDiff[];
  stage: MergeStage;
  createdAt: number;
}

/** 构件停用/替换后失效、等待审核恢复的关系 */
export interface RelationReview {
  id: string;
  relationId: string;
  building: string;
  cause: "deactivate" | "replace" | "recompute";
  sourceId: string; // 停用/替换的构件
  targetId?: string; // 替换目标
  from: string;
  to: string;
  oldJoint: JointType;
  affectedNodeIds: string[];
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  at: number;
  team: string;
  kind: "measure" | "merge" | "relation" | "review" | "legacy" | "system" | "remote";
  summary: string;
  snapshot?: unknown; // 原记录留档
}

export interface LayoutNode {
  id: string;
  label: string;
  kind: "column" | "beam" | "dougong" | "purlin";
  x: number;
  y: number;
}

export interface Building {
  name: string;
  nodes: LayoutNode[];
}

export interface ServerState {
  rev: number;
  components: Record<string, ComponentDoc>;
  relations: Relation[];
  measurements: Measurement[];
}

export interface LocalState {
  drafts: Draft[];
  batches: Record<string, Batch>;
  /** 离线会话开始时的构件基线（三路合并用） */
  bases: Record<string, ComponentDoc>;
  baseRelations: Relation[] | null;
}

export interface AppState {
  online: boolean;
  activeTeam: string;
  buildings: Building[];
  server: ServerState;
  local: LocalState;
  merge: MergeSession | null;
  reviews: RelationReview[];
  history: HistoryEntry[];
  /** 上传失败模拟：剩余第 N 条写入时失败（0 = 不模拟） */
  failAt: number;
  notices: { id: string; kind: "info" | "warn" | "ok"; text: string }[];
}
