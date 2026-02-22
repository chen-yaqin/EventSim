export default function SidePanel({
  selectedNode,
  details,
  loading,
  onToggleCollapse,
  onCopySummary,
  onOpenLineageWindow,
  onToggleCompare,
  compareSelected
}) {
  if (!selectedNode) {
    return (
      <aside className="card side-panel">
        <h3>Node Workspace</h3>
        <p>Select a world node to inspect details, chat by role, and continue branching.</p>
      </aside>
    );
  }

  return (
    <aside className="card side-panel">
      <h3>🧭 {selectedNode.title}</h3>
      <p className="muted">
        <strong>Focus:</strong> <em>{selectedNode.one_liner}</em>
      </p>
      <div className="chip-row">
        {(selectedNode.tags || []).map((tag) => (
          <span key={tag} className="chip">
            {tag}
          </span>
        ))}
      </div>
      <p className="confidence">Confidence: {selectedNode.confidence ?? "-"}</p>

      {loading ? (
        <div className="skeleton-list">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : details ? (
        <>
          <h4>✨ Key Effects</h4>
          <ul>
            {(details.consequences || []).slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h4>🧩 Why It Changes</h4>
          <p>{details.why_it_changes || "No explanation yet."}</p>
          <h4>⚠️ Risk Flags</h4>
          <div className="chip-row">
            {(details.risk_flags || ["uncertainty"]).map((flag) => (
              <span key={flag} className="chip chip-warn">
                {flag}
              </span>
            ))}
          </div>
          <h4>🎯 Next</h4>
          <p>
            <strong>{details.next_question || "What should we test next?"}</strong>
          </p>
        </>
      ) : (
        <p>No expanded details yet.</p>
      )}

      <div className="row">
        <button className="btn btn-soft" onClick={onToggleCollapse}>
          {selectedNode.collapsed ? "Expand Node" : "Collapse Node"}
        </button>
        <button className="btn btn-soft" onClick={onCopySummary}>
          Copy Summary
        </button>
        <button className="btn btn-soft" onClick={onOpenLineageWindow}>
          Open Lineage Window
        </button>
        <button className="btn btn-soft" onClick={onToggleCompare}>
          {compareSelected ? "Remove Compare" : "Select Compare"}
        </button>
      </div>
    </aside>
  );
}
