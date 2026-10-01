import { useMemo, useState } from "react";
import { useStore } from "../store";
import { JOINT_TYPES, WOOD_TYPES } from "../types";
import { Field, Panel, Pill } from "./ui";
import { fmtTime } from "../logic/engine";

export function MeasureForm() {
  const { state, dispatch } = useStore();
  const components = Object.values(state.server.components);
  const buildings = state.buildings.map((b) => b.name);

  const [building, setBuilding] = useState(buildings[0] ?? "");
  const [componentId, setComponentId] = useState(components[0]?.id ?? "");
  const [woodType, setWoodType] = useState(components[0]?.woodType ?? WOOD_TYPES[0]);
  const [jointType, setJointType] = useState(components[0]?.jointType ?? JOINT_TYPES[0]);
  const [section, setSection] = useState(components[0]?.section ?? "");
  const [diseaseLocation, setDiseaseLocation] = useState(components[0]?.diseaseLocation ?? "");
  const [deformation, setDeformation] = useState(components[0]?.deformation ?? "");
  const [repairSuggestion, setRepairSuggestion] = useState(components[0]?.repairSuggestion ?? "");
  const [action, setAction] = useState<"" | "deactivate" | "replace">("");
  const [targetId, setTargetId] = useState("");
  const [note, setNote] = useState("");

  const selected = state.server.components[componentId];

  const localDraftCount = state.local.drafts.filter((d) => d.team === state.activeTeam && d.state === "pending").length;
  const myLatestDraft = useMemo(
    () =>
      state.local.drafts
        .filter((d) => d.componentId === componentId)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0],
    [state.local.drafts, componentId]
  );

  function pickComponent(id: string) {
    setComponentId(id);
    const c = state.server.components[id];
    if (c) {
      setWoodType(c.woodType);
      setJointType(c.jointType);
      setSection(c.section);
      setDiseaseLocation(c.diseaseLocation);
      setDeformation(c.deformation);
      setRepairSuggestion(c.repairSuggestion);
      setAction("");
      setTargetId("");
    }
  }

  function save() {
    dispatch({
      type: "saveDraft",
      input: {
        building,
        componentId,
        woodType,
        jointType,
        section: section.trim(),
        diseaseLocation: diseaseLocation.trim(),
        deformation: deformation.trim(),
        repairSuggestion: repairSuggestion.trim(),
        measuredAt: Date.now(),
        statusAction: action === "" ? undefined : { type: action, targetId: action === "replace" ? targetId.trim() : undefined },
        note: note.trim() || undefined,
      },
    });
    setNote("");
    setAction("");
    setTargetId("");
  }

  return (
    <Panel
      sub="现场录入"
      title="构件测量草稿"
      right={
        <div className="header-actions">
          {state.online ? <Pill tone="ok">在线 · 直接入库</Pill> : <Pill tone="warn">离线 · 本地草稿 {localDraftCount}</Pill>}
          <button className="primary" onClick={save}>
            {state.online ? "保存测量并入库" : "保存到本地草稿"}
          </button>
        </div>
      }
    >
      <div className="field-grid">
        <Field label="所在建筑">
          <select value={building} onChange={(e) => setBuilding(e.target.value)}>
            {buildings.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </Field>
        <Field label="构件编号" hint="选择既有或填新编号">
          <input list="component-list" value={componentId} onChange={(e) => pickComponent(e.target.value)} placeholder="如 C-01" />
          <datalist id="component-list">
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="木材种类">
          <select value={woodType} onChange={(e) => setWoodType(e.target.value)}>
            {WOOD_TYPES.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </Field>
        <Field label="榫卯类型">
          <select value={jointType} onChange={(e) => setJointType(e.target.value as typeof jointType)}>
            {JOINT_TYPES.map((j) => (
              <option key={j}>{j}</option>
            ))}
          </select>
        </Field>
        <Field label="截面尺寸" hint="如 180×240mm / Φ300mm">
          <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="180×240mm" />
        </Field>
        <Field label="变形情况">
          <input value={deformation} onChange={(e) => setDeformation(e.target.value)} placeholder="如 向南倾斜 18mm" />
        </Field>
        <Field label="病害位置">
          <input value={diseaseLocation} onChange={(e) => setDiseaseLocation(e.target.value)} placeholder="如 柱脚糟朽 120mm" />
        </Field>
        <Field label="修缮建议">
          <input value={repairSuggestion} onChange={(e) => setRepairSuggestion(e.target.value)} placeholder="如 局部墩接" />
        </Field>
        <Field label="停用 / 替换提案" hint="将触发引用关系失效重算">
          <select value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
            <option value="">不变更</option>
            <option value="deactivate">停用该构件</option>
            <option value="replace">替换为新构件</option>
          </select>
        </Field>
        {action === "replace" && (
          <Field label="替换后的构件编号">
            <input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="如 C-01-新" />
          </Field>
        )}
        <Field label="备注">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="测量人/环境补充" />
        </Field>
      </div>

      {selected && (
        <div className="form-foot">
          <Pill tone={selected.status === "active" ? "ok" : selected.status === "deactivated" ? "bad" : "warn"}>
            站端档案：{selected.status === "active" ? "在用" : selected.status === "deactivated" ? "已停用" : `已替换→${selected.replacedBy}`} · rev{selected.rev}
          </Pill>
          <span>更新于 {fmtTime(selected.updatedAt)}</span>
          {myLatestDraft && (
            <Pill tone="info">
              最近本地草稿 {fmtTime(myLatestDraft.updatedAt)}
              {myLatestDraft.backfilled ? "（补版批次）" : ""}
            </Pill>
          )}
        </div>
      )}
    </Panel>
  );
}
