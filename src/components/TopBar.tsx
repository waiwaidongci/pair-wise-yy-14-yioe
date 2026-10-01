import { useStore } from "../store";

const TEAMS = ["测绘甲队", "测绘乙队", "测绘丙队"];

export default function TopBar() {
  const { online, chaos, toggleOnline, toggleChaos, resetAll, batches } = useStore();
  const failed = batches.filter((b) => b.status === "failed" || b.status === "partial").length;

  return (
    <header className="topbar">
      <div className="brand">
        <p className="kicker">hxyfront-62013 · 木结构榫卯构件测绘</p>
        <h1>古建测绘接续台</h1>
        <p className="sub">断网各自改构件病害与修缮意见，回站先合并差异、确认后再更新建筑关系</p>
      </div>
      <div className="top-actions">
        <span className={`net-badge ${online ? "online" : "offline"}`}>
          <i />
          {online ? "在线 · 可合并/上传" : "断网 · 本地草稿模式"}
        </span>
        {failed > 0 && <span className="pill warn">{failed} 个批次待重试</span>}
        <label className="switch">
          <input type="checkbox" checked={chaos} onChange={toggleChaos} />
          <span>弱网模拟</span>
        </label>
        <button className={online ? "" : "primary"} onClick={toggleOnline}>
          {online ? "断开网络（现场）" : "恢复网络（回站）"}
        </button>
        <button className="ghost" onClick={resetAll}>重置演示</button>
      </div>
    </header>
  );
}

export { TEAMS };
