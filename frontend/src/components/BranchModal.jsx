export default function BranchModal({
  open,
  node,
  input,
  childCount,
  onInputChange,
  onChildCountChange,
  onGenerate,
  onClose,
  loading
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Branch This Node</h3>
        <p className="muted">Selected: {node?.title || "-"}</p>
        <p className="muted">Ask a follow-up and generate N child worlds.</p>
        <label className="muted" htmlFor="branch-child-count">
          Child count (1-8)
        </label>
        <input
          id="branch-child-count"
          className="count-input"
          type="number"
          min={1}
          max={8}
          step={1}
          value={childCount}
          onChange={(e) => onChildCountChange(e.target.value)}
        />
        <textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Example: What if we prioritize retention over speed?"
        />
        <div className="row">
          <button className="btn" onClick={onGenerate} disabled={loading || !input.trim()}>
            {loading ? "Generating..." : "Generate Child Worlds"}
          </button>
          <button className="btn btn-soft" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
