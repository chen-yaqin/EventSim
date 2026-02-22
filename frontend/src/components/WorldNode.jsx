import { Handle, Position } from "reactflow";

export default function WorldNode({ data, selected }) {
  return (
    <div
      className={`world-node ${selected ? "is-selected" : ""} ${data.isCompareSelected ? "is-compare" : ""}`}
      style={{ animationDelay: `${data.animationDelay || 0}ms` }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="world-node-head">
        <div>
          <strong>{data.titleShort || data.title}</strong>
          <div className="node-subtitle">{data.oneLiner}</div>
        </div>
        <div className="node-actions">
          <button
            className="node-toggle nodrag nopan"
            onClick={(e) => {
              e.stopPropagation();
              data.onToggleCompare?.(data.id);
            }}
          >
            {data.isCompareSelected ? "Compared" : "Compare"}
          </button>
          {data.nodeType === "world" && (
            <button
              className="node-toggle nodrag nopan"
              onClick={(e) => {
                e.stopPropagation();
                data.onOpenBranch(data.id);
              }}
            >
              Branch
            </button>
          )}
          {data.hasChildren && (
            <button
              className="node-toggle nodrag nopan"
              onClick={(e) => {
                e.stopPropagation();
                data.onToggleCollapse(data.id);
              }}
            >
              {data.collapsed ? "Expand" : "Collapse"}
            </button>
          )}
        </div>
      </div>
      <div className="chip-row">
        {data.tags.map((tag) => (
          <span key={tag} className={`chip chip-node ${chipTone(tag)}`}>
            {tag}
          </span>
        ))}
      </div>
      <span className="node-confidence">conf {data.confidence}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function chipTone(tag) {
  const value = String(tag || "").toLowerCase();
  if (
    value.includes("risk") ||
    value.includes("uncertain") ||
    value.includes("radical") ||
    value.includes("loss")
  ) {
    return "chip-risk";
  }
  if (
    value.includes("benefit") ||
    value.includes("upside") ||
    value.includes("growth") ||
    value.includes("opportunity")
  ) {
    return "chip-benefit";
  }
  return "chip-action";
}
