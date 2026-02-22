import { Link } from "react-router-dom";

export default function TopBar({
  demoMode,
  onToggleDemo,
  onExport,
  callsUsed,
  onOpenCompare,
  compareReady,
  onOpenRuntimeConfig
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <Link to="/">EventSim</Link>
      </div>
      <nav className="topnav">
        <Link to="/sim">Simulator</Link>
        <Link to="/demo">Demo</Link>
      </nav>
      <div className="top-actions">
        <label className="toggle">
          <input type="checkbox" checked={demoMode} onChange={(e) => onToggleDemo(e.target.checked)} />
          <span>Demo Mode</span>
        </label>
        <button className="btn btn-soft" onClick={onOpenCompare} disabled={!compareReady}>
          Branch Compare
        </button>
        <button className="btn btn-soft" onClick={onExport}>
          Export JSON
        </button>
        <button className="btn btn-soft" onClick={onOpenRuntimeConfig}>
          Runtime Config
        </button>
        <span className="badge">Calls: {callsUsed}</span>
      </div>
    </header>
  );
}
