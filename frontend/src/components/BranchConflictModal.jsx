export default function BranchConflictModal({
  open,
  node,
  hasExistingChildren,
  loading,
  onOverwrite,
  onAppend,
  onCancel
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop branch-conflict-backdrop" onClick={onCancel}>
      <div className="modal branch-conflict-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{hasExistingChildren ? "Node Already Has Children" : "Choose Branch Action"}</h3>
        <p className="muted">
          <strong>{node?.title || "This node"}</strong>{" "}
          {hasExistingChildren
            ? "already has generated child nodes. Choose how to proceed."
            : "currently has no detected child nodes. You can still choose how to proceed."}
        </p>
        <div className="row">
          <button className="btn" onClick={onOverwrite} disabled={loading}>
            {loading ? "Generating..." : "Overwrite Existing Children"}
          </button>
          <button className="btn btn-soft" onClick={onAppend} disabled={loading}>
            Add New Children
          </button>
          <button className="btn btn-soft" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
