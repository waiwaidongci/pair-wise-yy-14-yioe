import { useMemo, useState } from "react";
import { useStore } from "../store";
import { TENON_TYPES, type TenonType } from "../types";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  active: { text: "在用", cls: "ok" },
  inactive: { text: "停用", cls: "bad" },
  replaced: { text: "已替换", cls: "warn" },
};

export default function ComponentList() {
  const { components, batches, deactivate, replaceComponent } = useStore();
  const [filter, setFilter] = useState<TenonType | "">("");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    return components
      .filter((c) => (filter ? c.tenon === filter : true))
      .filter((c) =>
        q.trim()
          ? c.code.includes(q.trim()) || c.building.includes(q.trim()) || c.diseaseLocation.includes(q.trim())
          : true,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [components, filter, q]);

  const batchLabel = (id: string) => batches.find((b) => b.id === id)?.label ?? "无批次";

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>构件清单</p>
          <h2>构件与测量记录</h2>
        </div>
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索编号 / 建筑 / 病害位置"
        />
      </div>

      <div className="chips">
        <button className={filter === "" ? "active" : ""} onClick={() => setFilter("")}>全部</button>
        {TENON_TYPES.map((t) => (
          <button key={t} className={filter === t ? "active" : ""} onClick={() => setFilter(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="records">
        {list.length === 0 && <p className="empty">没有匹配的构件记录。</p>}
        {list.map((c) => {
          const st = STATUS_LABEL[c.status];
          return (
            <article key={c.id} className={c.status !== "active" ? "dim" : ""}>
              <b>{c.tenon || "—"}</b>
              <div className="rec-body">
                <h3>
                  {c.code}
                  <span className={`badge ${st.cls}`}>{st.text}</span>
                  {c.legacy && <span className="badge slate">老草稿补版</span>}
                  {c.replacedBy && <span className="badge warn">已改指替换件</span>}
                </h3>
                <p>
                  {c.building} · {c.wood || "未标注木材"} · {c.section || "未标注截面"} · 批次第 {c.seq} 条
                </p>
                <p className="rec-detail">
                  病害：{c.diseaseLocation || "—"} · 变形：{c.deformation || "—"} · 建议：{c.suggestion || "—"}
                </p>
                <p className="rec-batch">批次：{batchLabel(c.batchId)}</p>
                {c.status === "active" && (
                  <div className="rec-actions">
                    <button className="mini" onClick={() => deactivate(c.id)}>停用</button>
                    <button className="mini" onClick={() => replaceComponent(c.id)}>替换</button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
