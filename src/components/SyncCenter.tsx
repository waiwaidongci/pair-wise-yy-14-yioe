import { useState } from "react";
import { useStore } from "../store";
import type { FieldDiff, RelationDiff } from "../types";
import { EmptyState, Panel, Pill } from "./ui";
import { fmtTime, unresolved } from "../logic/engine";

const BATCH_LABEL = {
  queueing: { t: "离线攒批中", tone: "warn" as const },
  ready: { t: "待上传", tone: "info" as const },
  uploading: { t: "上传中", tone: "info" as const },
  failed: { t: "失败待重试", tone: "bad" as const },
  uploaded: { t: "已上传", tone: "ok" as const },
};

function DiffTriCell({ value, chosen, dim = false }: { value: string; chosen: boolean; dim?: boolean }) {
  return (
    <td className={dim ? "dim" : ""}>
      <span className={chosen ? "chosen" : ""}>{value || <em className="muted">空</em>}</span>
    </td>
  );
}

function FieldDiffTable({ diffs, onResolve }: { diffs: FieldDiff[]; onResolve: (key: string, r: "local" | "remote") => void }) {
  return (
    <div className="table-wrap">
      <table className="data-table diff-table">
        <thead>
          <tr>
            <th>构件 / 字段</th>
            <th>断网基线</th>
            <th>本地草稿</th>
            <th>站端（别队）</th>
            <th style={{ width: 190 }}>取值</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((d) => (
            <tr key={d.key} className={d.conflict ? "row-conflict" : ""}>
              <td>
                <div className="mono">{d.componentLabel}</div>
                <small>{d.fieldLabel}</small>
                {d.conflict ? <Pill tone="bad">冲突</Pill> : <Pill tone="neutral">自动{d.resolution === "local" ? "取本地" : "取站端"}</Pill>}
              </td>
              <DiffTriCell value={d.base} chosen={false} dim />
              <DiffTriCell value={d.local} chosen={d.resolution === "local"} />
              <DiffTriCell value={d.remote} chosen={d.resolution === "remote"} />
              <td>
                <div className="seg tight">
                  <button className={`seg-btn ${d.resolution === "local" ? "active" : ""}`} onClick={() => onResolve(d.key, "local")}>
                    用本地
                  </button>
                  <button className={`seg-btn ${d.resolution === "remote" ? "active" : ""}`} onClick={() => onResolve(d.key, "remote")}>
                    用站端
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RelationDiffTable({ diffs, onResolve }: { diffs: RelationDiff[]; onResolve: (key: string, r: "local" | "remote") => void }) {
  return (
    <div className="table-wrap">
      <table className="data-table diff-table">
        <thead>
          <tr>
            <th>榫卯关系</th>
            <th>断网基线</th>
            <th>本地提案</th>
            <th>站端现状</th>
            <th style={{ width: 190 }}>取值</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((d) => (
            <tr key={d.key} className={d.conflict ? "row-conflict" : ""}>
              <td className="mono">
                {d.label} <Pill tone={d.conflict ? "bad" : "neutral"}>{d.conflict ? "冲突" : "自动"}</Pill>
              </td>
              <DiffTriCell value={d.base} chosen={false} dim />
              <DiffTriCell value={d.local} chosen={d.resolution === "local"} />
              <DiffTriCell value={d.remote} chosen={d.resolution === "remote"} />
              <td>
                <div className="seg tight">
                  <button className={`seg-btn ${d.resolution === "local" ? "active" : ""}`} onClick={() => onResolve(d.key, "local")}>
                    用本地
                  </button>
                  <button className={`seg-btn ${d.resolution === "remote" ? "active" : ""}`} onClick={() => onResolve(d.key, "remote")}>
                    用站端
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SyncCenter() {
  const { state, dispatch } = useStore();
  const [failAt, setFailAt] = useState(2);

  const myPending = state.local.drafts.filter((d) => d.team === state.activeTeam && d.state === "pending");
  const myConfirmed = state.local.drafts.filter((d) => d.team === state.activeTeam && d.state === "confirmed");
  const batches = Object.values(state.local.batches)
    .filter((b) => b.team === state.activeTeam)
    .sort((a, b) => b.createdAt - a.createdAt);
  const pendingReviews = state.reviews.filter((r) => r.status === "pending");

  const merge = state.merge;
  const fieldLeft = merge ? merge.fieldDiffs.filter((d) => unresolved(d)).length : 0;
  const relLeft = merge ? merge.relationDiffs.filter((d) => unresolved(d)).length : 0;

  return (
    <div className="sync-grid">
      <Panel
        sub="同步中心"
        title="网络与批次"
        right={
          <button className={state.online ? "net-btn online" : "net-btn offline"} onClick={() => dispatch({ type: "toggleOnline" })}>
            <i />
            {state.online ? "在线（点击断网）" : "断网（点击恢复）"}
          </button>
        }
      >
        <div className="sync-stats">
          <div><strong>{myPending.length}</strong><span>待合并草稿</span></div>
          <div><strong>{myConfirmed.length}</strong><span>待上传测量</span></div>
          <div><strong>{batches.filter((b) => b.status === "failed").length}</strong><span>失败批次</span></div>
          <div><strong className={pendingReviews.length ? "text-bad" : ""}>{pendingReviews.length}</strong><span>待审关系</span></div>
        </div>

        <div className="sim-box">
          <p className="panel-sub">断网演练（模拟别组回站抢改）</p>
          <div className="chips">
            <button disabled={state.online} onClick={() => dispatch({ type: "simRemote", kind: "joint" })}>别组改 A-03 榫卯</button>
            <button disabled={state.online} onClick={() => dispatch({ type: "simRemote", kind: "deactivate" })}>别组替换 C-01</button>
            <button disabled={state.online} onClick={() => dispatch({ type: "simRemote", kind: "disease" })}>别组补 P-11 病害</button>
          </div>
          <div className="fail-row">
            <label>
              上传时在本批次第
              <input type="number" min={1} max={9} value={failAt} onChange={(e) => setFailAt(Number(e.target.value))} />
              条模拟失败（0=不模拟）
            </label>
            <button onClick={() => dispatch({ type: "setFailAt", n: failAt })}>挂失败点</button>
          </div>
          <small className="muted">
            建议流程：断网 → 录入几条草稿（可含停用/替换）→ 点上面的“别组…”制造冲突 → 恢复联网 → 开始合并 → 逐项确认 → 挂失败点上传 → 原批次重试。
          </small>
        </div>

        <div className="merge-actions">
          <button
            className="primary big"
            disabled={state.online === false || myPending.length === 0 || !!merge}
            onClick={() => dispatch({ type: "beginMerge" })}
          >
            {state.online ? "① 开始合并本地差异" : "需先恢复联网"}
          </button>
          <small className="muted">合并只读差异，不直接覆盖；字段与关系全部确认后才更新建筑关系。</small>
        </div>

        <h3>批次队列（按原批次重试）</h3>
        {batches.length === 0 ? (
          <EmptyState>还没有批次。断网保存的草稿自动归入当前批次。</EmptyState>
        ) : (
          <ul className="batch-list">
            {batches.map((b) => {
              const total = b.draftIds.length;
              const bl = BATCH_LABEL[b.status];
              return (
                <li key={b.id} className={b.status === "failed" ? "batch-failed" : ""}>
                  <div className="batch-head">
                    <strong className="mono">{b.id}</strong>
                    <Pill tone={bl.tone}>{bl.t}</Pill>
                  </div>
                  <div className="progress">
                    <div className="bar" style={{ width: `${total ? (b.cursor / total) * 100 : 0}%` }} />
                  </div>
                  <small>
                    已确认 {b.cursor}/{total} · 最后构件 {b.lastComponentId ?? "—"} · 失败 {b.failCount} 次 · 建批 {fmtTime(b.createdAt)}
                  </small>
                  {(b.status === "ready" || b.status === "failed") && (
                    <button className="primary mini" onClick={() => dispatch({ type: "uploadBatch", batchId: b.id })}>
                      {b.status === "failed" ? `从 ${b.lastComponentId ?? "断点"} 之后重试` : "② 按批次上传"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel sub="差异审核" title="合并工作台">
        {!merge ? (
          <EmptyState>
            断网恢复后点“开始合并本地差异”。系统以断网瞬间快照为基线做三路合并：只有一方修改的字段自动取值；双方都改则列为冲突，由你选择，不覆盖别人刚定的榫卯关系。
          </EmptyState>
        ) : merge.stage === "done" ? (
          <EmptyState>差异已全部确认并应用，可在左侧按批次上传。</EmptyState>
        ) : (
          <>
            <div className="merge-head">
              <Pill tone="info">合并单 {merge.id}</Pill>
              <span>批次 {merge.batchIds.length} 个 · {fmtTime(merge.createdAt)}</span>
              <button onClick={() => dispatch({ type: "cancelMerge" })}>暂不合并</button>
            </div>

            <div className="steps">
              <span className={merge.stage === "fields" ? "active" : "done"}>1 字段差异{fieldLeft ? `（${fieldLeft} 待决）` : " ✓"}</span>
              <i>→</i>
              <span className={merge.stage === "relations" ? "active" : ""}>2 榫卯关系差异{merge.stage === "relations" && relLeft ? `（${relLeft} 待决）` : ""}</span>
              <i>→</i>
              <span>3 更新关系并上传</span>
            </div>

            {merge.stage === "fields" && (
              <>
                {merge.fieldDiffs.length === 0 ? (
                  <EmptyState>字段无差异。</EmptyState>
                ) : (
                  <FieldDiffTable
                    diffs={merge.fieldDiffs}
                    onResolve={(key, r) => dispatch({ type: "resolveField", key, resolution: r })}
                  />
                )}
                <div className="step-actions">
                  <button className="primary" disabled={fieldLeft > 0} onClick={() => dispatch({ type: "confirmFields" })}>
                    {fieldLeft > 0 ? `还有 ${fieldLeft} 个冲突未选择` : "确认字段差异，下一步看关系"}
                  </button>
                </div>
              </>
            )}

            {merge.stage === "relations" && (
              <>
                {merge.relationDiffs.length === 0 ? (
                  <EmptyState>榫卯关系无差异。确认后即更新建筑关系。</EmptyState>
                ) : (
                  <RelationDiffTable
                    diffs={merge.relationDiffs}
                    onResolve={(key, r) => dispatch({ type: "resolveRelation", key, resolution: r })}
                  />
                )}
                <div className="step-actions">
                  <button className="primary" disabled={relLeft > 0} onClick={() => dispatch({ type: "confirmRelations" })}>
                    {relLeft > 0 ? `还有 ${relLeft} 个关系冲突未选择` : "③ 确认全部差异，更新建筑关系"}
                  </button>
                  <small className="muted">确认后：停用/替换/改型涉及的关系失效重算，受影响节点进入下方审核，批次转为待上传。</small>
                </div>
              </>
            )}
          </>
        )}

        <h3 className="mt">关系失效审核（审核后才恢复）</h3>
        {pendingReviews.length === 0 ? (
          <EmptyState>无待审关系。</EmptyState>
        ) : (
          <ul className="review-list">
            {pendingReviews.map((rv) => (
              <li key={rv.id}>
                <div className="batch-head">
                  <strong className="mono">{rv.relationId}：{rv.from} ⇢ {rv.to}</strong>
                  <Pill tone={rv.cause === "deactivate" ? "bad" : rv.cause === "replace" ? "warn" : "info"}>
                    {rv.cause === "deactivate" ? "端点停用" : rv.cause === "replace" ? "端点替换" : "榫卯改型"}
                  </Pill>
                </div>
                <p>{rv.reason}</p>
                <small>
                  受影响节点：<b>{rv.affectedNodeIds.join("、")}</b>
                  {rv.targetId ? ` · 新构件 ${rv.targetId}` : ""}
                </small>
                <div className="seg tight">
                  <button className="seg-btn" onClick={() => dispatch({ type: "review", id: rv.id, decision: "approved" })}>
                    审核通过 · 恢复（按当前榫卯 {state.server.components[rv.from]?.jointType}）
                  </button>
                  <button className="seg-btn" onClick={() => dispatch({ type: "review", id: rv.id, decision: "rejected" })}>
                    驳回 · 归档关系
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
