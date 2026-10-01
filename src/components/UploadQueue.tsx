import { useStore } from "../store";
import type { BatchStatus } from "../types";

const STATUS: Record<BatchStatus, { text: string; cls: string }> = {
  open: { text: "待上传", cls: "slate" },
  uploading: { text: "上传中", cls: "warn" },
  partial: { text: "部分确认", cls: "warn" },
  done: { text: "已完成", cls: "ok" },
  failed: { text: "失败", cls: "bad" },
};

export default function UploadQueue() {
  const { batches, components, online, uploadBatch } = useStore();

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>上传队列</p>
          <h2>按批次断点续传</h2>
        </div>
        <span className="legend">失败后按原批次重试，从最后确认的构件继续，已写入的测量按幂等键去重</span>
      </div>

      {!online && <p className="empty bad">当前断网，批次暂存本机；恢复网络后即可上传。</p>}

      <div className="batches">
        {batches.map((b) => {
          const total = components.filter((c) => c.batchId === b.id).length || b.total;
          const pct = total ? Math.round((b.confirmedSeq / total) * 100) : 0;
          const st = STATUS[b.status];
          return (
            <article key={b.id} className="batch-card">
              <div className="batch-head">
                <h3>
                  {b.label}
                  {b.legacy && <span className="badge slate">老草稿补版</span>}
                  <span className={`badge ${st.cls}`}>{st.text}</span>
                </h3>
                <span className="batch-team">{b.team}</span>
              </div>
              <div className="progress">
                <i style={{ width: `${pct}%` }} />
              </div>
              <p className="batch-meta">
                已确认 <b>{b.confirmedSeq}</b> / {total} 条
                {b.status === "partial" && <span className="badge warn">从第 {b.confirmedSeq + 1} 条继续</span>}
              </p>
              {b.failReason && <p className="batch-fail">失败原因：{b.failReason}</p>}
              <div className="rec-actions">
                {b.status !== "done" && (
                  <button
                    className="mini primary"
                    disabled={!online || b.status === "uploading"}
                    onClick={() => uploadBatch(b.id)}
                  >
                    {b.status === "uploading" ? "上传中…" : b.confirmedSeq > 0 ? "按原批次重试" : "上传批次"}
                  </button>
                )}
                {b.status === "done" && <span className="badge ok">幂等校验通过，无重复写入</span>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
