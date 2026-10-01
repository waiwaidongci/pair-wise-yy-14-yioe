import { useState } from "react";
import { useStore } from "../store";
import { fmtClock } from "../lib/utils";

const KIND_CLS: Record<string, string> = {
  info: "slate",
  ok: "ok",
  warn: "warn",
  bad: "bad",
};

export default function LogPanel() {
  const { logs } = useStore();
  const [open, setOpen] = useState(true);

  return (
    <section className="panel log-panel">
      <div className="heading" onClick={() => setOpen((o) => !o)} style={{ cursor: "pointer" }}>
        <div>
          <p>操作日志</p>
          <h2>接续记录（{logs.length}）</h2>
        </div>
        <button className="mini">{open ? "收起" : "展开"}</button>
      </div>
      {open && (
        <div className="log-list">
          {logs.map((l) => (
            <div key={l.id} className="log-item">
              <span className="log-time">{fmtClock(l.time)}</span>
              <span className={`badge ${KIND_CLS[l.kind]}`}>{l.kind}</span>
              <span className="log-text">{l.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
