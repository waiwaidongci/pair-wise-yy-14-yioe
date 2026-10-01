import { useState } from "react";
import { useStore } from "../store";
import { JOINT_TYPES } from "../types";
import { EmptyState, Panel, Pill } from "./ui";
import { fmtTime } from "../logic/engine";

const STATE_LABEL: Record<string, { t: string; tone: "neutral" | "info" | "ok" | "warn" }> = {
  pending: { t: "待合并", tone: "warn" },
  confirmed: { t: "待上传", tone: "info" },
  written: { t: "已入库", tone: "ok" },
  skipped: { t: "已跳过", tone: "neutral" },
};

export function MeasurementsTable() {
  const { state } = useStore();
  const [scope, setScope] = useState<"all" | "server" | "local">("all");
  const [joint, setJoint] = useState("全部");
  const [team, setTeam] = useState("全部");

  const teams = ["全部", ...new Set(state.local.drafts.map((d) => d.team))];
  const rows: {
    key: string;
    at: number;
    team: string;
    componentId: string;
    jointType: string;
    section: string;
    diseaseLocation: string;
    deformation: string;
    where: "server" | "local";
    stateLabel?: { t: string; tone: "neutral" | "info" | "ok" | "warn" };
    batchId: string;
  }[] = [];

  if (scope !== "local") {
    for (const m of state.server.measurements) {
      rows.push({
        key: m.id,
        at: m.writtenAt,
        team: m.team,
        componentId: m.componentId,
        jointType: m.jointType,
        section: m.section,
        diseaseLocation: m.diseaseLocation,
        deformation: m.deformation,
        where: "server",
        stateLabel: STATE_LABEL.written,
        batchId: m.batchId,
      });
    }
  }
  if (scope !== "server") {
    for (const d of state.local.drafts) {
      rows.push({
        key: "d-" + d.id,
        at: d.measuredAt,
        team: d.team,
        componentId: d.componentId,
        jointType: d.jointType,
        section: d.section,
        diseaseLocation: d.diseaseLocation,
        deformation: d.deformation,
        where: "local",
        stateLabel: STATE_LABEL[d.state],
        batchId: d.batchId ?? "（无批次）",
      });
    }
  }

  const filtered = rows
    .filter((r) => joint === "全部" || r.jointType === joint)
    .filter((r) => team === "全部" || r.team === team)
    .sort((a, b) => b.at - a.at);

  return (
    <Panel
      sub="尺寸记录表"
      title="测量流水（本地草稿 + 已入库）"
      right={
        <div className="seg">
          {(["all", "local", "server"] as const).map((s) => (
            <button key={s} className={scope === s ? "seg-btn active" : "seg-btn"} onClick={() => setScope(s)}>
              {s === "all" ? "全部" : s === "local" ? "本地草稿" : "站端入库"}
            </button>
          ))}
        </div>
      }
    >
      <div className="filter-row">
        <div className="chips">
          {["全部", ...JOINT_TYPES].map((j) => (
            <button key={j} className={joint === j ? "chip active" : "chip"} onClick={() => setJoint(j)}>
              {j}
            </button>
          ))}
        </div>
        <select value={team} onChange={(e) => setTeam(e.target.value)}>
          {teams.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState>暂无测量记录。断网录入后会先出现在“本地草稿”，上传成功后进入“站端入库”，同一测量不会重复出现两条入库记录。</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>队伍</th>
                <th>构件编号</th>
                <th>榫卯</th>
                <th>截面尺寸</th>
                <th>病害位置</th>
                <th>变形</th>
                <th>批次</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.key}>
                  <td className="nowrap">{fmtTime(r.at)}</td>
                  <td>{r.team}</td>
                  <td className="mono">{r.componentId}</td>
                  <td>{r.jointType}</td>
                  <td className="mono">{r.section || "—"}</td>
                  <td>{r.diseaseLocation || "—"}</td>
                  <td>{r.deformation || "—"}</td>
                  <td className="mono small">{r.batchId}</td>
                  <td>
                    {r.stateLabel && <Pill tone={r.stateLabel.tone}>{r.where === "local" ? "草稿·" : ""}{r.stateLabel.t}</Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
