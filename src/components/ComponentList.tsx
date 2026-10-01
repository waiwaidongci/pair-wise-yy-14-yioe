import { useState } from "react";
import { useStore } from "../store";
import { JOINT_TYPES } from "../types";
import { Panel, statusPill } from "./ui";
import { fmtTime } from "../logic/engine";

export function ComponentList() {
  const { state, dispatch } = useStore();
  const [joint, setJoint] = useState<string>("全部");
  const [onlyHot, setOnlyHot] = useState(false);

  const pendingIds = new Set(
    state.reviews.filter((r) => r.status === "pending").flatMap((r) => r.affectedNodeIds)
  );

  let list = Object.values(state.server.components).sort((a, b) => a.id.localeCompare(b.id));
  if (joint !== "全部") list = list.filter((c) => c.jointType === joint);
  if (onlyHot) list = list.filter((c) => pendingIds.has(c.id));

  return (
    <Panel
      sub="构件清单"
      title={`大雄宝殿 · 构件档案（${list.length}）`}
      right={
        <label className="check">
          <input type="checkbox" checked={onlyHot} onChange={(e) => setOnlyHot(e.target.checked)} />
          只看待审受影响节点
        </label>
      }
    >
      <div className="chips">
        {["全部", ...JOINT_TYPES].map((j) => (
          <button key={j} className={joint === j ? "chip active" : "chip"} onClick={() => setJoint(j)}>
            {j}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>构件编号</th>
              <th>名称</th>
              <th>木材</th>
              <th>榫卯</th>
              <th>截面尺寸</th>
              <th>病害位置 / 变形</th>
              <th>修缮意见</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className={pendingIds.has(c.id) ? "row-hot" : ""}>
                <td className="mono">
                  {c.id}
                  {pendingIds.has(c.id) && <span className="hot-tag">受影响</span>}
                </td>
                <td>{c.name}</td>
                <td>{c.woodType}</td>
                <td>{c.jointType}</td>
                <td className="mono">{c.section}</td>
                <td>
                  <div>{c.diseaseLocation || "—"}</div>
                  <small>{c.deformation || "无变形记录"}</small>
                </td>
                <td>{c.repairSuggestion}</td>
                <td>
                  {statusPill(c.status)}
                  <small className="block">rev{c.rev} · {fmtTime(c.updatedAt).slice(5)}</small>
                </td>
                <td className="nowrap">
                  {c.status === "active" && state.online && (
                    <>
                      <button className="mini bad" onClick={() => {
                        const id = window.prompt(`确认停用 ${c.id}？其榫卯关系将失效重算（输入 停用 确认）`);
                        if (id === "停用") dispatch({ type: "componentActionOnline", componentId: c.id, action: { type: "deactivate" } });
                      }}>
                        停用
                      </button>
                      <button className="mini" onClick={() => {
                        const t = window.prompt(`将 ${c.id} 替换为新构件，请输入新编号`);
                        if (t && t.trim()) dispatch({ type: "componentActionOnline", componentId: c.id, action: { type: "replace", targetId: t.trim() } });
                      }}>
                        替换
                      </button>
                    </>
                  )}
                  {c.status === "active" && !state.online && <small className="muted">离线变更请在录入表提交</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
