import type { AppState, Building, LayoutNode, Relation } from "../types";

export interface GraphProps {
  building: Building;
  relations: Relation[];
  components: AppState["server"]["components"];
  reviews: AppState["reviews"];
  highlightNodeIds?: string[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  showDisease?: boolean;
  showInvalid?: boolean;
}

const KIND_LABEL: Record<LayoutNode["kind"], string> = {
  column: "柱",
  beam: "梁",
  dougong: "斗拱",
  purlin: "檩",
};

/** 病害关键字 → 颜色 */
export function diseaseColor(text: string): string {
  if (!text || text === "无") return "";
  if (/裂|糟朽|朽|环裂/.test(text)) return "#b91c1c";
  if (/倾|变形|挠|沉降|下沉|外倾|松|卯口/.test(text)) return "#b45309";
  return "#0f766e";
}

function nodeCenter(node: LayoutNode) {
  return { x: node.x, y: node.y };
}

function nodeShape(node: LayoutNode, selected: boolean) {
  const stroke = selected ? "#854d0e" : "#475569";
  const sw = selected ? 3.5 : 2;
  if (node.kind === "column") {
    return <rect x={node.x - 16} y={node.y - 52} width={32} height={104} rx={4} fill="#f3ead9" stroke={stroke} strokeWidth={sw} />;
  }
  if (node.kind === "beam") {
    return <rect x={node.x - 190} y={node.y - 14} width={380} height={28} rx={5} fill="#e8dcc5" stroke={stroke} strokeWidth={sw} />;
  }
  if (node.kind === "purlin") {
    return <rect x={node.x - 150} y={node.y - 10} width={300} height={20} rx={10} fill="#dcebe8" stroke={stroke} strokeWidth={sw} />;
  }
  return <path d={`M ${node.x} ${node.y - 26} L ${node.x + 26} ${node.y} L ${node.x} ${node.y + 26} L ${node.x - 26} ${node.y} Z`} fill="#eef2f7" stroke={stroke} strokeWidth={sw} />;
}

export function TimberGraph({
  building,
  relations,
  components,
  reviews,
  highlightNodeIds = [],
  selectedId,
  onSelect,
  showDisease = false,
  showInvalid = true,
}: GraphProps) {
  const byId = new Map(building.nodes.map((n) => [n.id, n]));
  const highlight = new Set(highlightNodeIds);
  const pendingByEdge = new Map(reviews.filter((r) => r.status === "pending").map((r) => [r.relationId, r]));

  return (
    <svg viewBox="0 0 840 360" className="timber-graph" role="img" aria-label={`${building.name}榫卯关系图`}>
      {/* 地面线 */}
      <line x1={30} y1={352} x2={810} y2={352} stroke="#94a3b8" strokeDasharray="6 6" />

      {relations
        .filter((r) => !r.archived && byId.has(r.from) && byId.has(r.to))
        .map((r) => {
          const a = nodeCenter(byId.get(r.from)!);
          const b = nodeCenter(byId.get(r.to)!);
          const review = pendingByEdge.get(r.id);
          const color = showInvalid && !r.valid ? "#dc2626" : r.valid ? "#854d0e" : "#94a3b8";
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return (
            <g key={r.id} className={showInvalid && !r.valid ? "edge-invalid" : ""}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={r.valid ? 2 : 2.4} strokeDasharray={r.valid ? undefined : "7 5"} />
              <g transform={`translate(${mx},${my})`}>
                <rect x={-34} y={-13} width={68} height={22} rx={11} fill="#ffffff" stroke={color} />
                <text x={0} y={2} textAnchor="middle" fontSize={12} fill={color} fontWeight={700}>
                  {r.joint}
                </text>
              </g>
              {review && (
                <g transform={`translate(${mx + 36},${my - 22})`}>
                  <circle r={9} fill="#dc2626" />
                  <text x={0} y={4} textAnchor="middle" fontSize={12} fill="#fff" fontWeight={800}>
                    审
                  </text>
                </g>
              )}
            </g>
          );
        })}

      {building.nodes.map((node) => {
        const c = components[node.id];
        const selected = selectedId === node.id;
        const hot = highlight.has(node.id);
        const dColor = showDisease ? diseaseColor(c?.diseaseLocation ?? "") : "";
        return (
          <g
            key={node.id}
            className={`tg-node ${onSelect ? "clickable" : ""} ${hot ? "hot" : ""}`}
            onClick={() => onSelect?.(node.id)}
            transform={`translate(0,0)`}
          >
            {hot && <circle cx={node.x} cy={node.y} r={46} fill="rgba(220,38,38,0.08)" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" />}
            {nodeShape(node, selected)}
            <text x={node.x} y={node.y + 72} textAnchor="middle" fontSize={13} fontWeight={700} fill="#172033">
              {node.label}
            </text>
            <g transform={`translate(${node.x - 20},${node.y - 62})`}>
              <rect width={20} height={16} rx={3} fill="#475569" />
              <text x={10} y={12} textAnchor="middle" fontSize={11} fill="#fff">
                {KIND_LABEL[node.kind]}
              </text>
            </g>
            {showDisease && dColor && (
              <g transform={`translate(${node.x + 20},${node.y - 62})`}>
                <circle r={10} fill={dColor} />
                <text x={0} y={4} textAnchor="middle" fontSize={12} fill="#fff" fontWeight={800}>
                  病
                </text>
              </g>
            )}
            {c && c.status !== "active" && (
              <g transform={`translate(${node.x + 20},${node.y + 40})`}>
                <rect x={-26} y={-10} width={52} height={20} rx={10} fill={c.status === "deactivated" ? "#dc2626" : "#b45309"} />
                <text x={0} y={4} textAnchor="middle" fontSize={11} fill="#fff" fontWeight={700}>
                  {c.status === "deactivated" ? "停用" : "替换"}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
