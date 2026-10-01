import { useStore } from "../store";

export default function MergeCenter() {
  const { online, conflicts, resolveConflict, resolveAll, confirmMerge, components, runMerge } = useStore();

  const pending = conflicts.filter((c) => c.resolution === "pending").length;
  const groups = new Map<string, typeof conflicts>();
  for (const c of conflicts) {
    if (!groups.has(c.code)) groups.set(c.code, []);
    groups.get(c.code)!.push(c);
  }

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>差异合并</p>
          <h2>本地草稿 vs 服务器</h2>
        </div>
        <div className="rec-actions">
          <button className="mini" onClick={runMerge} disabled={!online}>扫描差异</button>
          <button className="mini" onClick={() => resolveAll("local")} disabled={!conflicts.length}>全部采用本地</button>
          <button className="mini" onClick={() => resolveAll("server")} disabled={!conflicts.length}>全部采用服务端</button>
          <button className="mini primary" onClick={confirmMerge} disabled={!conflicts.length || pending > 0}>
            确认合并{pending > 0 ? `（剩 ${pending} 项）` : ""}
          </button>
        </div>
      </div>

      {!online && <p className="empty bad">当前断网，无法与服务器合并。回站恢复网络后再操作。</p>}
      {online && conflicts.length === 0 && (
        <p className="empty">
          暂无差异。点击「扫描差异」后，本地草稿与服务器不一致的字段会逐条列出；
          差异确认完才会更新建筑关系，未确认前不覆盖任何人的榫卯关系。
        </p>
      )}

      <div className="merge-groups">
        {[...groups.entries()].map(([code, items]) => {
          const comp = components.find((c) => c.code === code);
          return (
            <div key={code} className="merge-group">
              <h3>
                {code}
                <span className="badge slate">{comp?.building}</span>
              </h3>
              {items.map((c) => (
                <div key={c.id} className="merge-row">
                  <span className="merge-field">{c.label}</span>
                  <label className={c.resolution === "local" ? "pick local" : "pick"}>
                    <input
                      type="radio"
                      name={c.id}
                      checked={c.resolution === "local"}
                      onChange={() => resolveConflict(c.id, "local")}
                    />
                    <span>本地草稿</span>
                    <b>{c.localValue || "（空）"}</b>
                  </label>
                  <label className={c.resolution === "server" ? "pick server" : "pick"}>
                    <input
                      type="radio"
                      name={c.id}
                      checked={c.resolution === "server"}
                      onChange={() => resolveConflict(c.id, "server")}
                    />
                    <span>服务端</span>
                    <b>{c.serverValue || "（空）"}</b>
                  </label>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
