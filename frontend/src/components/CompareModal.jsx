export default function CompareModal({ open, left, right, onClose }) {
  if (!open) return null;

  const changed = diff(left, right, "delta");
  const diverged = diff(left, right, "one_liner");
  const stable = stableTags(left, right);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Compare Nodes</h3>
        <div className="compare-grid">
          <div>
            <h4>A: {left?.title || "-"}</h4>
            <p>{left?.one_liner || "-"}</p>
          </div>
          <div>
            <h4>B: {right?.title || "-"}</h4>
            <p>{right?.one_liner || "-"}</p>
          </div>
        </div>
        <h4>What Changed</h4>
        <ul>
          {changed.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h4>What Diverged</h4>
        <ul>
          {diverged.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h4>What Stayed Stable</h4>
        <ul>
          {stable.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function diff(a, b, key) {
  const av = a?.[key] || "";
  const bv = b?.[key] || "";
  if (av === bv) return ["No major difference"];
  return [`A: ${av}`, `B: ${bv}`];
}

function stableTags(a, b) {
  const as = new Set(a?.tags || []);
  const bs = new Set(b?.tags || []);
  const common = [...as].filter((x) => bs.has(x));
  return common.length ? common : ["No shared tags"];
}
