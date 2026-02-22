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
  const value = String(tag || "").toLowerCase().trim();
  const tokens = value.split(/[^a-z0-9]+/).filter(Boolean);
  if (!tokens.length) return "chip-action";

  const negativeLexicon = new Set([
    "risk",
    "risky",
    "high",
    "uncertain",
    "uncertainty",
    "radical",
    "loss",
    "failure",
    "fragile",
    "debt",
    "overrun",
    "delay",
    "conflict",
    "burnout",
    "churn",
    "instability",
    "blocked",
    "blocker"
  ]);
  const positiveLexicon = new Set([
    "mitigate",
    "mitigation",
    "minimal",
    "safe",
    "stable",
    "stability",
    "benefit",
    "upside",
    "growth",
    "opportunity",
    "resilient",
    "robust",
    "alignment",
    "efficient",
    "clarity",
    "mvp"
  ]);

  let negativeScore = 0;
  let positiveScore = 0;
  for (const token of tokens) {
    if (negativeLexicon.has(token)) negativeScore += 1;
    if (positiveLexicon.has(token)) positiveScore += 1;
  }

  if (value.includes("low-risk") || value.includes("low_risk")) positiveScore += 2;
  if (value.includes("high-risk") || value.includes("high_risk")) negativeScore += 2;

  if (negativeScore > positiveScore) return "chip-risk";
  if (positiveScore > negativeScore) return "chip-benefit";
  return "chip-action";
}
