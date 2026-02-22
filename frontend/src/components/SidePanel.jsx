export default function SidePanel({
  selectedNode,
  details,
  loading,
  onToggleCollapse,
  onCopySummary,
  onOpenLineageWindow
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
      <h3>{selectedNode.title}</h3>
      <p className="muted">{selectedNode.one_liner}</p>
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
          <h4>Consequences</h4>
          <ul>
            {details.consequences?.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h4>Why It Changes</h4>
          <p>{details.why_it_changes}</p>
          <h4>Next Question</h4>
          <p>{details.next_question}</p>
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
      </div>
    </aside>
  );
}
