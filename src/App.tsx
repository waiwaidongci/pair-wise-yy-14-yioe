import { useState, type ReactNode } from "react";
import { StoreProvider, useStore } from "./store";
import TopBar from "./components/TopBar";
import MetricsBar from "./components/MetricsBar";
import EntryForm from "./components/EntryForm";
import ComponentList from "./components/ComponentList";
import DiseaseMap from "./components/DiseaseMap";
import RelationshipView from "./components/RelationshipView";
import MergeCenter from "./components/MergeCenter";
import UploadQueue from "./components/UploadQueue";
import Archive from "./components/Archive";
import LogPanel from "./components/LogPanel";

type Tab = {
  key: string;
  label: string;
  badge?: number;
  badgeCls?: string;
  render: () => ReactNode;
};

function Workbench() {
  const { conflicts, reviewIds, batches, online, runMerge } = useStore();
  const [tab, setTab] = useState("entry");

  const failed = batches.filter((b) => b.status === "failed" || b.status === "partial").length;

  const tabs: Tab[] = [
    { key: "entry", label: "测绘录入", render: () => <EntryForm /> },
    { key: "list", label: "构件清单", render: () => <ComponentList /> },
    { key: "disease", label: "病害标记图", render: () => <DiseaseMap /> },
    {
      key: "relation",
      label: "关系视图",
      badge: reviewIds.length,
      badgeCls: "bad",
      render: () => <RelationshipView />,
    },
    {
      key: "merge",
      label: "合并差异",
      badge: conflicts.length,
      badgeCls: conflicts.length ? "warn" : undefined,
      render: () => <MergeCenter />,
    },
    {
      key: "upload",
      label: "上传队列",
      badge: failed,
      badgeCls: "bad",
      render: () => <UploadQueue />,
    },
    { key: "archive", label: "草稿档案", render: () => <Archive /> },
  ];

  return (
    <main className="app">
      <TopBar />
      <MetricsBar />

      <nav className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => {
              setTab(t.key);
              if (t.key === "merge" && online) runMerge();
            }}
          >
            {t.label}
            {typeof t.badge === "number" && t.badge > 0 && (
              <span className={`tab-badge ${t.badgeCls ?? ""}`}>{t.badge}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="tab-body">{tabs.find((t) => t.key === tab)?.render()}</div>

      <LogPanel />

      <footer className="foot">
        <p>
          离线接续测绘台 · 草稿本地持久化（localStorage）· 差异字段级合并 · 关系失效重算与审核 · 批次断点续传与幂等去重 · 老草稿补版可查
        </p>
      </footer>
    </main>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Workbench />
    </StoreProvider>
  );
}
