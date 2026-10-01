import { useStore } from "../store";
import { fmtTime } from "../lib/utils";

export default function Archive() {
  const { batches, components, migrate } = useStore();

  const legacyBatches = batches.filter((b) => b.legacy);
  const legacyRecords = components.filter((c) => c.legacy);
  const orphanCount = components.filter((c) => !c.batchId).length;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>草稿档案</p>
          <h2>老草稿补版与原记录</h2>
        </div>
        <button className="primary" onClick={migrate} disabled={orphanCount === 0}>
          扫描老草稿并补批次标识
        </button>
      </div>

      <p className="archive-note">
        缺少批次标识的老草稿，按最后编辑时间补一版批次（如「老草稿补版 · 时间戳」），
        原记录保留不删除、不覆盖，仍可在此查询。当前有 <b>{orphanCount}</b> 条记录缺批次标识。
      </p>

      <div className="batches">
        {legacyBatches.length === 0 && <p className="empty">尚未补版的老草稿。点击上方按钮扫描补版。</p>}
        {legacyBatches.map((b) => {
          const records = components.filter((c) => c.batchId === b.id);
          return (
            <article key={b.id} className="batch-card legacy">
              <div className="batch-head">
                <h3>
                  {b.label}
                  <span className="badge slate">补版批次</span>
                </h3>
                <span className="batch-team">{b.team}</span>
              </div>
              <p className="batch-meta">最后编辑时间：{fmtTime(b.lastEditAt)} · 共 {records.length} 条</p>
              <div className="records">
                {records.map((c) => (
                  <article key={c.id}>
                    <b>{c.tenon || "—"}</b>
                    <div>
                      <h3>{c.code} <span className="badge slate">原记录可查</span></h3>
                      <p>{c.building} · {c.section} · 病害：{c.diseaseLocation} · {c.deformation} · {c.suggestion}</p>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      {legacyRecords.length > 0 && (
        <p className="archive-note">补版后的记录已并入构件清单与上传队列，原始内容未做改动。</p>
      )}
    </section>
  );
}
