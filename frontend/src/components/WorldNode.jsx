import { Handle, Position } from "reactflow";

export default function WorldNode({ data }) {
  return (
    <div className="world-node">
      <Handle type="target" position={Position.Top} />
      <div className="world-node-head">
        <strong>{data.title}</strong>
        <div className="node-actions">
          {data.nodeType === "world" && (
            <button
              className="node-toggle"
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
              className="node-toggle"
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
      <p>{data.oneLiner}</p>
      <div className="chip-row">
        {data.tags.map((tag) => (
          <span key={tag} className="chip chip-node">
            {tag}
          </span>
        ))}
      </div>
      <span className="node-confidence">conf {data.confidence}</span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
