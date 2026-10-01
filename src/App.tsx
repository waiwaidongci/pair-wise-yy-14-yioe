import { useMemo, useState } from "react";
import { StoreProvider, useStore } from "./store";
import { TEAMS } from "./data/seed";
import { MeasureForm } from "./components/MeasureForm";
import { ComponentList } from "./components/ComponentList";
import { MeasurementsTable } from "./components/MeasurementsTable";
import { DiseaseMap } from "./components/DiseaseMap";
import { RelationView } from "./components/RelationView";
import { SyncCenter } from "./components/SyncCenter";
import { HistoryPanel } from "./components/HistoryPanel";
import { Pill } from "./components/ui";

const TABS = [
  { id: "measure", label: "现场测量" },
  { id: "components", label: "构件清单" },
  { id: "dimensions", label: "尺寸记录表" },
  { id: "disease", label: "病害标记图" },
  { id: "relations", label: "关系视图" },
  { id: "sync", label: "同步中心" },
  { id: "history", label: "履历留档" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function TopBar() {
  const { state, dispatch } = useStore();
  const pendingDrafts = state.local.drafts.filter((d) => d.state === "pending").length;
  const failed = Object.values(state.local.batches).filter((b) => b.status === "failed").length;
  const pendingReviews = state.reviews.filter((r) => r.status === "pending").length;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">卯</span>
        <div>
          <h1>古建木结构 · 离线测绘台</h1>
          <small>本地草稿接续 · 差异合并审核 · 榫卯关系重算 · 批次断点续传</small>
        </div>
      </div>
      <div className="top-controls">
        <label className="team-select">
          当班测绘队
          <select value={state.activeTeam} onChange={(e) => dispatch({ type: "setTeam", team: e.target.value })}>
            {TEAMS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <button className={state.online ? "net-btn online" : "net-btn offline"} onClick={() => dispatch({ type: "toggleOnline" })}>
          <i />
          {state.online ? "在线" : "断网"}
        </button>
        <div className="top-badges">
          <Pill tone={pendingDrafts ? "warn" : "neutral"}>待合并 {pendingDrafts}</Pill>
          <Pill tone={failed ? "bad" : "neutral"}>失败批次 {failed}</Pill>
          <Pill tone={pendingReviews ? "bad" : "neutral"}>待审关系 {pendingReviews}</Pill>
        </div>
      </div>
    </header>
  );
}

function Notices() {
  const { state, dispatch } = useStore();
  if (state.notices.length === 0) return null;
  return (
    <div className="notices">
      {state.notices.map((n) => (
        <div key={n.id} className={`notice notice-${n.kind}`}>
          <span>{n.text}</span>
          <button onClick={() => dispatch({ type: "dismissNotice", id: n.id })}>×</button>
        </div>
      ))}
    </div>
  );
}

function Shell() {
  const { state } = useStore();
  const [tab, setTab] = useState<TabId>("measure");

  const metrics = useMemo(() => {
    const comps = Object.values(state.server.components);
    return [
      { label: "构件数量", value: comps.length },
      { label: "病害点", value: comps.filter((c) => c.diseaseLocation && c.diseaseLocation !== "无").length },
      { label: "榫卯类型", value: new Set(comps.map((c) => c.jointType)).size },
      { label: "待修缮", value: comps.filter((c) => /建议|更换|墩接|加固|归安|铁箍/.test(c.repairSuggestion)).length },
      { label: "本地草稿", value: state.local.drafts.filter((d) => d.state === "pending").length },
      { label: "入库测量", value: state.server.measurements.length },
    ];
  }, [state]);

  return (
    <div className="app">
      <TopBar />
      <Notices />

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "sync" && state.merge && <i className="tab-dot" />}
          </button>
        ))}
      </nav>

      <main className="tab-body">
        {tab === "measure" && (
          <div className="stack">
            <MeasureForm />
            <MeasurementsTable />
          </div>
        )}
        {tab === "components" && <ComponentList />}
        {tab === "dimensions" && <MeasurementsTable />}
        {tab === "disease" && <DiseaseMap />}
        {tab === "relations" && <RelationView />}
        {tab === "sync" && <SyncCenter />}
        {tab === "history" && <HistoryPanel />}
      </main>

      <footer className="foot">
        数据保存在本机浏览器（localStorage），断网可继续录入；刷新/重开页面后草稿、批次断点与未决合并均保留。
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
