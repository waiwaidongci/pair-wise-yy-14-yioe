import { useMemo } from "react";
import { useStore } from "../store";

interface Marker {
  x: number;
  y: number;
  code: string;
  text: string;
  level: "bad" | "warn" | "ok";
}

/** 病害标记图：按病害位置把构件定位到建筑剖面示意图上 */
export default function DiseaseMap() {
  const { components } = useStore();

  const markers = useMemo<Marker[]>(() => {
    const cols = components.filter((c) => c.code.includes("柱"));
    const beams = components.filter((c) => c.code.includes("梁") || c.code.includes("枋"));
    const dous = components.filter((c) => c.code.includes("斗"));

    const colX = [130, 300, 470];
    const list: Marker[] = [];

    const pushFor = (c: (typeof components)[number], x: number, y: number) => {
      const severe = c.deformation.includes("开裂") || c.deformation.includes("糟朽");
      const warn = c.deformation.includes("变形") || c.deformation.includes("朽");
      list.push({
        x,
        y,
        code: c.code,
        text: `${c.diseaseLocation || "未定位"} · ${c.deformation || "无变形"}`,
        level: severe ? "bad" : warn ? "warn" : "ok",
      });
    };

    cols.forEach((c, i) => {
      const x = colX[Math.min(i, colX.length - 1)];
      const y = c.diseaseLocation.includes("柱脚") ? 300 : c.diseaseLocation.includes("柱身") ? 240 : 270;
      pushFor(c, x, y);
    });
    beams.forEach((c, i) => {
      const x = c.diseaseLocation.includes("端") ? (i % 2 === 0 ? 110 : 490) : 300;
      pushFor(c, x, 150);
    });
    dous.forEach((c) => pushFor(c, 300, 105));

    return list;
  }, [components]);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>病害标记图</p>
          <h2>建筑剖面病害定位</h2>
        </div>
        <span className="legend">
          <i className="dot bad" /> 严重 <i className="dot warn" /> 注意 <i className="dot ok" /> 正常
        </span>
      </div>

      <svg viewBox="0 0 600 360" className="disease-map" role="img" aria-label="病害标记图">
        {/* 地面 */}
        <line x1="40" y1="320" x2="560" y2="320" stroke="#94a3b8" strokeWidth="3" />
        {/* 柱 */}
        {[130, 300, 470].map((x) => (
          <rect key={x} x={x - 14} y={180} width={28} height={140} rx="3" fill="#e7d9c4" stroke="#854d0e" strokeWidth="2" />
        ))}
        {/* 梁 */}
        <rect x="60" y="150" width="480" height="30" rx="4" fill="#efe3d0" stroke="#854d0e" strokeWidth="2" />
        {/* 斗拱 */}
        {[130, 300, 470].map((x) => (
          <g key={x}>
            <rect x={x - 18} y="128" width="36" height="12" rx="2" fill="#f6efe2" stroke="#854d0e" strokeWidth="1.5" />
            <rect x={x - 12} y="112" width="24" height="10" rx="2" fill="#f6efe2" stroke="#854d0e" strokeWidth="1.5" />
          </g>
        ))}
        <text x="300" y="60" textAnchor="middle" fontSize="14" fill="#64748b">
          明间剖面 · 柱网 / 梁架 / 斗拱
        </text>

        {markers.map((m, i) => (
          <g key={`${m.code}-${i}`}>
            <circle cx={m.x} cy={m.y} r="11" fill={m.level === "bad" ? "#dc2626" : m.level === "warn" ? "#d97706" : "#0f766e"} stroke="#fff" strokeWidth="2.5" />
            <text x={m.x} y={m.y + 4} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700">
              {i + 1}
            </text>
            <text x={m.x} y={m.y - 16} textAnchor="middle" fontSize="11" fill="#334155" fontWeight="600">
              {m.code}
            </text>
          </g>
        ))}
      </svg>

      <div className="marker-list">
        {markers.length === 0 && <p className="empty">暂无病害标记。</p>}
        {markers.map((m, i) => (
          <div key={i} className="marker-item">
            <span className={`dot ${m.level}`} />
            <b>{m.code}</b>
            <span>{m.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
