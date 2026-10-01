import React from "react";

export function Pill({ tone = "neutral", children }: { tone?: "ok" | "warn" | "bad" | "info" | "neutral"; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Panel({
  title,
  sub,
  right,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title !== undefined && (
        <div className="heading">
          <div>
            {sub ? <p className="panel-sub">{sub}</p> : null}
            <h2>{title}</h2>
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {hint ? <em>{hint}</em> : null}
      </span>
      {children}
    </label>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function statusPill(status: "active" | "deactivated" | "replaced") {
  if (status === "active") return <Pill tone="ok">在用</Pill>;
  if (status === "deactivated") return <Pill tone="bad">已停用</Pill>;
  return <Pill tone="warn">已替换</Pill>;
}
