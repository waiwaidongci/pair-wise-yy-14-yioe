import { useState } from "react";
import { useStore } from "../store";
import { EmptyState, Panel, Pill } from "./ui";
import { fmtTime } from "../logic/engine";

const KIND_LABEL: Record<string, { t: string; tone: "ok" | "warn" | "bad" | "info" | "neutral" }> = {
  measure: { t: "测量", tone: "info" },
  merge: { t: "合并", tone: "warn" },
  relation: { t: "关系", tone: "bad" },
  review: { t: "审核", tone: "ok" },
  legacy: { t: "老稿补版", tone: "warn" },
  system: { t: "批次", tone: "neutral" },
  remote: { t: "别队提交", tone: "info" },
};

export function HistoryPanel() {
  const { state, dispatch } = useStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [kind, setKind] = useState("全部");

  const kinds = ["全部", ...new Set(state.history.map((h) => h.kind))];
  const list = state.history.filter((h) => kind === "全部" || h.kind === kind);

  return (
    <Panel
      sub="履历留档"
      title={`操作履历（${state.history.length}）`}
      right={
        <button className="danger-ghost" onClick={() => {
          if (window.confirm("重置演示数据（清空本地存储并恢复初始档案与老草稿）？")) dispatch({ type: "reset" });
        }}>
          重置演示数据
        </button>
      }
    >
      <div className="chips">
        {kinds.map((k) => (
          <button key={k} className={kind === k ? "chip active" : "chip"} onClick={() => setKind(k)}>
            {KIND_LABEL[k]?.t ?? k}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState>暂无履历。</EmptyState>
      ) : (
        <ul className="history-list">
          {list.map((h) => {
            const kl = KIND_LABEL[h.kind] ?? { t: h.kind, tone: "neutral" as const };
            return (
              <li key={h.id}>
                <div className="batch-head" onClick={() => setExpanded(expanded === h.id ? null : h.id)}>
                  <span className="mono small">{fmtTime(h.at)}</span>
                  <Pill tone={kl.tone}>{kl.t}</Pill>
                  <strong>{h.team}</strong>
                  <span className="hist-summary">{h.summary}</span>
                </div>
                {expanded === h.id && h.snapshot !== undefined && (
                  <pre className="snapshot">{JSON.stringify(h.snapshot, null, 2)}</pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
