import { useState } from "react";
import { useStore } from "../store";
import { TENON_TYPES } from "../types";
import { TEAMS } from "./TopBar";

const EMPTY = {
  code: "",
  building: "大雄宝殿",
  wood: "",
  tenon: "" as "" | (typeof TENON_TYPES)[number],
  section: "",
  diseaseLocation: "",
  deformation: "",
  suggestion: "",
  team: TEAMS[0],
};

export default function EntryForm() {
  const { addComponent, batches } = useStore();
  const [form, setForm] = useState(EMPTY);
  const [saved, setSaved] = useState(false);

  const set = (k: keyof typeof EMPTY, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  const submit = () => {
    if (!form.code.trim()) return;
    addComponent({ ...form, status: "active" });
    setForm((f) => ({ ...EMPTY, team: f.team, building: f.building }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const openBatch = batches.find(
    (b) => b.team === form.team && !b.legacy && b.status !== "done",
  );

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>现场录入</p>
          <h2>新增构件测量</h2>
        </div>
        <button className="primary" onClick={submit} disabled={!form.code.trim()}>
          存入本地草稿
        </button>
      </div>

      <div className="field-grid">
        <label>
          <span>建筑名称</span>
          <input value={form.building} onChange={(e) => set("building", e.target.value)} placeholder="如 大雄宝殿" />
        </label>
        <label>
          <span>构件编号 *</span>
          <input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="如 梁架A-03" />
        </label>
        <label>
          <span>木材种类</span>
          <input value={form.wood} onChange={(e) => set("wood", e.target.value)} placeholder="如 杉木 / 楠木" />
        </label>
        <label>
          <span>榫卯类型</span>
          <select value={form.tenon} onChange={(e) => set("tenon", e.target.value)}>
            <option value="">未标注</option>
            {TENON_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span>截面尺寸</span>
          <input value={form.section} onChange={(e) => set("section", e.target.value)} placeholder="如 180x240mm" />
        </label>
        <label>
          <span>病害位置</span>
          <input value={form.diseaseLocation} onChange={(e) => set("diseaseLocation", e.target.value)} placeholder="如 梁端榫头 / 柱脚" />
        </label>
        <label>
          <span>变形情况</span>
          <input value={form.deformation} onChange={(e) => set("deformation", e.target.value)} placeholder="如 端部开裂Ⅱ级" />
        </label>
        <label>
          <span>修缮建议</span>
          <input value={form.suggestion} onChange={(e) => set("suggestion", e.target.value)} placeholder="如 建议更换榫头" />
        </label>
        <label>
          <span>测绘队</span>
          <select value={form.team} onChange={(e) => set("team", e.target.value)}>
            {TEAMS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-hint">
        {openBatch ? (
          <span>
            本次测量将计入批次 <b>{openBatch.label}</b>（已有 {openBatch.total} 条，序号 {openBatch.total + 1}），断网下仅保存在本机。
          </span>
        ) : (
          <span>该测绘队没有未完成批次，保存时将自动新开批次。</span>
        )}
        {saved && <span className="saved-flag">✓ 已存入本地草稿</span>}
      </div>
    </section>
  );
}
