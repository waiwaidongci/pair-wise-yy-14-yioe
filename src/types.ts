// 古建木结构榫卯构件测绘台 —— 领域类型定义

export type TenonType = "燕尾榫" | "透榫" | "半榫" | "箍头榫";
export const TENON_TYPES: TenonType[] = ["燕尾榫", "透榫", "半榫", "箍头榫"];

export type ComponentStatus = "active" | "inactive" | "replaced";
export type BatchStatus = "open" | "uploading" | "partial" | "done" | "failed";
export type RelStatus = "valid" | "invalid" | "pending-review";

/** 构件测量记录（本地草稿的最小单元） */
export interface ComponentRecord {
  id: string;
  /** 构件编号，如 梁架A-03 */
  code: string;
  /** 建筑名称 */
  building: string;
  /** 木材种类 */
  wood: string;
  /** 榫卯类型 */
  tenon: TenonType | "";
  /** 截面尺寸，如 180x240mm */
  section: string;
  /** 病害位置 */
  diseaseLocation: string;
  /** 变形情况 */
  deformation: string;
  /** 修缮建议 */
  suggestion: string;
  /** 构件状态：在用 / 停用 / 已替换 */
  status: ComponentStatus;
  /** 替换后的新构件 id */
  replacedBy?: string;
  /** 批次标识（老草稿可能缺失，迁移时补版） */
  batchId: string;
  /** 批次内序号，断点续传与幂等的依据 */
  seq: number;
  /** 最后编辑时间 */
  updatedAt: number;
  createdAt: number;
  /** 是否为老草稿补版产生的记录 */
  legacy: boolean;
  /** 测绘队 */
  team: string;
}

/** 构件之间的榫卯/搭接连理关系 */
export interface Relationship {
  id: string;
  fromId: string;
  toId: string;
  kind: string;
  status: RelStatus;
  /** 失效原因 */
  reason?: string;
  batchId: string;
  updatedAt: number;
}

/** 上传批次 */
export interface DraftBatch {
  id: string;
  label: string;
  team: string;
  status: BatchStatus;
  /** 老草稿补版批次 */
  legacy: boolean;
  /** 补版依据的最后编辑时间 */
  lastEditAt: number;
  createdAt: number;
  /** 最后确认的构件序号（断点续传起点） */
  confirmedSeq: number;
  total: number;
  failReason?: string;
}

/** 字段级差异项 */
export interface ConflictItem {
  id: string;
  batchId: string;
  componentId: string;
  code: string;
  field: string;
  label: string;
  localValue: string;
  serverValue: string;
  resolution: "local" | "server" | "pending";
}

/** 受影响节点（失效关系的两端） */
export interface AffectedNode {
  relationshipId: string;
  fromId: string;
  fromCode: string;
  toId: string;
  toCode: string;
  reason: string;
}

export interface LogEntry {
  id: string;
  time: number;
  text: string;
  kind: "info" | "warn" | "ok" | "bad";
}
