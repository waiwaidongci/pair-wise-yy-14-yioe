import { useStore } from "../store";
import { EmptyState, Panel, Pill } from "./ui";
import { TimberGraph } from "./TimberGraph";

export function RelationView() {
  const { state } = useStore();
  const building = state.buildings[0];

  const pendingReviews = state.reviews.filter((r) => r.status === "pending");
  const affected = Array.from(new Set(pendingReviews.flatMap((r) => r.affectedNodeIds)));
  const visibleRelations = state.server.relations.filter((r) => !r.archived);
  const invalid = visibleRelations.filter((r) => !r.valid);

  return (
    <Panel
      sub="单栋建筑构件关系视图"
      title={`${building.name} · 榫卯关系（${visibleRelations.filter((r) => r.valid).length} 有效 / ${invalid.length} 失效待审）`}
      right={<Pill tone={invalid.length ? "bad" : "ok"}>{invalid.length ? "存在失效关系" : "关系完整"}</Pill>}
    >
      <div className="map-canvas">
        <TimberGraph
          building={building}
          relations={visibleRelations}
          components={state.server.components}
          reviews={state.reviews}
          highlightNodeIds={affected}
          showInvalid
        />
      </div>
      <div className="relation-foot">
        <div>
          <h3>失效与受影响节点</h3>
          {pendingReviews.length === 0 ? (
            <EmptyState>当前没有待审核的失效关系。构件停用或替换后，引用它的榫卯关系会在此失效重算并高亮受影响节点，审核通过才恢复。</EmptyState>
          ) : (
            <ul className="affected-list">
              {pendingReviews.map((rv) => (
                <li key={rv.id}>
                  <div>
                    <strong className="mono">{rv.relationId}</strong>
                    <Pill tone={rv.cause === "deactivate" ? "bad" : rv.cause === "replace" ? "warn" : "info"}>
                      {rv.cause === "deactivate" ? "停用" : rv.cause === "replace" ? "替换" : "榫卯改型"}
                    </Pill>
                    <span className="mono">
                      {rv.from} ⇢ {rv.to}（{rv.oldJoint}）
                    </span>
                  </div>
                  <p>{rv.reason}</p>
                  <small>
                    受影响节点：{rv.affectedNodeIds.join("、")}
                    {rv.targetId ? ` · 替换目标 ${rv.targetId}` : ""}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}
