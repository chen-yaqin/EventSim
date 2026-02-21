export default function SidePanel({
  selectedNode,
  details,
  loading,
  onCompare,
  onPin,
  onCopySummary
}) {
  if (!selectedNode) {
    return (
      <aside className="card side-panel">
        <h3>Node Details</h3>
        <p>Select a node to expand structured insights.</p>
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
          {(details.risk_flags || []).length > 0 && (
            <>
              <h4>Risk Flags</h4>
              <div className="chip-row">
                {details.risk_flags.map((flag) => (
                  <span key={flag} className="chip chip-warn">
                    {flag}
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <p>No expanded details yet.</p>
      )}

      <div className="row">
        <button className="btn btn-soft" onClick={onCompare}>
          Compare
        </button>
        <button className="btn btn-soft" onClick={onPin}>
          Pin
        </button>
        <button className="btn btn-soft" onClick={onCopySummary}>
          Copy Summary
        </button>
      </div>
    </aside>
  );
}
