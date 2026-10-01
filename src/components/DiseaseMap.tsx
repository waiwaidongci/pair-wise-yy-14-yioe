import { useState } from "react";
import { useStore } from "../store";
import { EmptyState, Panel, Pill } from "./ui";
import { TimberGraph, diseaseColor } from "./TimberGraph";

export function DiseaseMap() {
  const { state } = useStore();
  const building = state.buildings[0];
  const [selected, setSelected] = useState<string>("C-01");
  const c = state.server.components[selected];

  const diseaseCount = Object.values(state.server.components).filter(
    (x) => x.diseaseLocation && x.diseaseLocation !== "无"
  ).length;

  return (
    <Panel
      sub="病害标记图"
      title={`${building.name} · 病害标记（${diseaseCount} 处）`}
      right={
        <div className="legend">
          <span><i style={{ background: "#b91c1c" }} />开裂/糟朽</span>
          <span><i style={{ background: "#b45309" }} />变形/松动</span>
          <span><i style={{ background: "#0f766e" }} />其他病害</span>
        </div>
      }
    >
      <div className="map-layout">
        <div className="map-canvas">
          <TimberGraph
            building={building}
            relations={state.server.relations}
            components={state.server.components}
            reviews={state.reviews}
            showDisease
            selectedId={selected}
            onSelect={setSelected}
          />
        </div>
        <aside className="map-detail">
          {c ? (
            <>
              <h3>
                {c.name} <span className="mono">{c.id}</span>
              </h3>
              <dl>
                <dt>截面尺寸</dt>
                <dd className="mono">{c.section}</dd>
                <dt>病害位置</dt>
                <dd>
                  {c.diseaseLocation || "无"}
                  {diseaseColor(c.diseaseLocation) && (
                    <Pill tone={/裂|朽/.test(c.diseaseLocation) ? "bad" : /倾|挠|沉降|下沉|松|卯口/.test(c.diseaseLocation) ? "warn" : "info"}>
                      已标记
                    </Pill>
                  )}
                </dd>
                <dt>变形情况</dt>
                <dd>{c.deformation || "无变形记录"}</dd>
                <dt>修缮建议</dt>
                <dd>{c.repairSuggestion || "—"}</dd>
                <dt>更新时间</dt>
                <dd>{new Date(c.updatedAt).toLocaleString("zh-CN")}</dd>
              </dl>
            </>
          ) : (
            <EmptyState>点击图中构件查看病害详情</EmptyState>
          )}
        </aside>
      </div>
    </Panel>
  );
}
