import { useStore } from "../store";

export default function MetricsBar() {
  const { components, relationships, conflicts, reviewIds } = useStore();
  const disease = components.filter(
    (c) => c.diseaseLocation && c.deformation && !c.deformation.includes("未见"),
  ).length;
  const tenons = new Set(components.map((c) => c.tenon).filter(Boolean)).size;
  const pending = components.filter(
    (c) => c.suggestion && c.suggestion.includes("建议") && !c.suggestion.includes("继续监测"),
  ).length;

  const items = [
    { label: "构件数量", value: components.length, tone: "primary" },
    { label: "病害点", value: disease, tone: "bad" },
    { label: "榫卯类型", value: tenons, tone: "accent" },
    { label: "待修缮", value: pending, tone: "warn" },
    { label: "待确认差异", value: conflicts.length, tone: conflicts.length ? "warn" : "ok" },
    { label: "待审核关系", value: reviewIds.length, tone: reviewIds.length ? "bad" : "ok" },
    { label: "关系总数", value: relationships.length, tone: "slate" },
  ];

  return (
    <section className="metrics">
      {items.map((m) => (
        <article key={m.label} className={`tone-${m.tone}`}>
          <small>{m.label}</small>
          <strong>{m.value}</strong>
        </article>
      ))}
    </section>
  );
}
