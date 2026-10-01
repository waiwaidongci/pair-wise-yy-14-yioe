import { useMemo } from "react";
import { useStore } from "../store";

const W = 600;
const H = 380;

function layout(n: number) {
  const cx = W / 2;
  const cy = H / 2 + 10;
  const r = Math.min(150, 40 + n * 18);
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

export default function RelationshipView() {
  const { components, relationships, reviewIds, reviewRel } = useStore();

  const nodes = useMemo(() => {
    const pos = layout(components.length);
    return components.map((c, i) => ({ ...c, ...pos[i] }));
  }, [components]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const reviewRels = relationships.filter((r) => reviewIds.includes(r.id));

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>构件关系视图</p>
          <h2>榫卯/搭接关系与受影响节点</h2>
        </div>
        <span className="legend">
          <i className="dot ok" /> 有效 <i className="dot bad" /> 失效 <i className="dot warn" /> 待审核
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="rel-map" role="img" aria-label="构件关系视图">
        {relationships.map((r) => {
          const from = nodeById.get(r.fromId);
          const to = nodeById.get(r.toId);
          if (!from || !to) return null;
          const color = r.status === "invalid" ? "#dc2626" : r.status === "pending-review" ? "#d97706" : "#64748b";
          return (
            <g key={r.id}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={color}
                strokeWidth="2.5"
                strokeDasharray={r.status === "invalid" ? "7 5" : r.status === "pending-review" ? "3 4" : "0"}
              />
              <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6} textAnchor="middle" fontSize="10" fill={color}>
                {r.kind}
                {r.reason ? `（${r.reason}）` : ""}
              </text>
            </g>
          );
        })}
        {nodes.map((n) => {
          const inReview = reviewIds.some((rid) =>
            relationships.find((r) => r.id === rid && (r.fromId === n.id || r.toId === n.id)),
          );
          const fill = n.status === "active" ? "#0f766e" : n.status === "inactive" ? "#dc2626" : "#d97706";
          return (
            <g key={n.id}>
              {inReview && <circle cx={n.x} cy={n.y} r="26" fill="none" stroke="#d97706" strokeWidth="3" strokeDasharray="5 4" />}
              <circle cx={n.x} cy={n.y} r="20" fill={fill} stroke="#fff" strokeWidth="2.5" />
              <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="10" fill="#fff" fontWeight="700">
                {n.code.replace(/[A-Za-z]/g, "").slice(0, 4) || "件"}
              </text>
              <text x={n.x} y={n.y + 40} textAnchor="middle" fontSize="11" fill="#334155" fontWeight="600">
                {n.code}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="review-queue">
        <h3>失效关系审核队列（{reviewRels.length}）</h3>
        {reviewRels.length === 0 && <p className="empty">无待审核关系。构件停用或替换后，引用它的关系会在这里列出受影响节点，审核后才恢复。</p>}
        {reviewRels.map((r) => {
          const from = components.find((c) => c.id === r.fromId);
          const to = components.find((c) => c.id === r.toId);
          const replaced = to?.status === "replaced" && to.replacedBy;
          return (
            <div key={r.id} className="review-item">
              <div>
                <b>{from?.code ?? "?"}</b> —{r.kind}→ <b>{to?.code ?? "?"}</b>
                {replaced && <span className="badge warn">将改指替换件 {components.find((c) => c.id === to!.replacedBy)?.code}</span>}
                <p className="review-reason">原因：{r.reason}。{replaced ? "恢复后关系改指替换构件。" : "恢复前关系保持失效。"}</p>
              </div>
              <div className="rec-actions">
                <button className="mini primary" onClick={() => reviewRel(r.id, "restore")}>审核恢复</button>
                <button className="mini" onClick={() => reviewRel(r.id, "keep")}>保持失效</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
