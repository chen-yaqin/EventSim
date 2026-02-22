export default function CompareModal({ open, left, right, leftDetails, rightDetails, onClose, onExport }) {
  if (!open) return null;

  const leftPros = extractPros(left, leftDetails);
  const leftCons = extractCons(left, leftDetails);
  const leftRisks = extractRisks(left, leftDetails);
  const rightPros = extractPros(right, rightDetails);
  const rightCons = extractCons(right, rightDetails);
  const rightRisks = extractRisks(right, rightDetails);

  const conclusion = [
    "Branch Compare",
    `A: ${left?.title || "-"}`,
    `- Pros: ${leftPros.join("; ")}`,
    `- Cons: ${leftCons.join("; ")}`,
    `- Risks: ${leftRisks.join("; ")}`,
    "",
    `B: ${right?.title || "-"}`,
    `- Pros: ${rightPros.join("; ")}`,
    `- Cons: ${rightCons.join("; ")}`,
    `- Risks: ${rightRisks.join("; ")}`
  ].join("\n");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>⚖️ Branch Compare</h3>
        <div className="compare-grid">
          <div className="compare-col">
            <h4>🅰️ {left?.title || "-"}</h4>
            <p className="muted">
              <em>{left?.one_liner || "-"}</em>
            </p>
            <h4>✅ Pros</h4>
            <ul>
              {leftPros.slice(0, 3).map((item) => (
                <li key={`a_pro_${item}`}>{item}</li>
              ))}
            </ul>
            <h4>❌ Cons</h4>
            <ul>
              {leftCons.slice(0, 3).map((item) => (
                <li key={`a_con_${item}`}>{item}</li>
              ))}
            </ul>
            <h4>⚠️ Risks</h4>
            <ul>
              {leftRisks.slice(0, 3).map((item) => (
                <li key={`a_risk_${item}`}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="compare-col">
            <h4>🅱️ {right?.title || "-"}</h4>
            <p className="muted">
              <em>{right?.one_liner || "-"}</em>
            </p>
            <h4>✅ Pros</h4>
            <ul>
              {rightPros.slice(0, 3).map((item) => (
                <li key={`b_pro_${item}`}>{item}</li>
              ))}
            </ul>
            <h4>❌ Cons</h4>
            <ul>
              {rightCons.slice(0, 3).map((item) => (
                <li key={`b_con_${item}`}>{item}</li>
              ))}
            </ul>
            <h4>⚠️ Risks</h4>
            <ul>
              {rightRisks.slice(0, 3).map((item) => (
                <li key={`b_risk_${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => onExport?.(conclusion)}>
            Export Conclusion
          </button>
          <button className="btn btn-soft" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function extractPros(node, details) {
  const positives = (details?.consequences || [])
    .map((item) => String(item || "").trim())
    .filter((item) => item && !containsRiskWord(item))
    .slice(0, 3);
  if (positives.length) return positives;
  const benefitTags = (node?.tags || []).filter((tag) => isBenefitTag(tag)).slice(0, 2);
  if (benefitTags.length) return benefitTags.map((tag) => `Potential upside in ${tag}`);
  return ["Potential upside not explicit"];
}

function extractCons(node, details) {
  const negatives = (details?.consequences || [])
    .map((item) => String(item || "").trim())
    .filter((item) => item && (containsRiskWord(item) || containsConstraintWord(item)))
    .slice(0, 3);
  if (negatives.length) return negatives;
  const riskyTags = (node?.tags || []).filter((tag) => isRiskTag(tag)).slice(0, 2);
  if (riskyTags.length) return riskyTags.map((tag) => `Tradeoff around ${tag}`);
  return ["Main downside needs validation"];
}

function extractRisks(node, details) {
  const flags = normalizeList(details?.risk_flags, []).slice(0, 3);
  if (flags.length) return flags;
  const riskyTags = (node?.tags || []).filter((tag) => isRiskTag(tag)).slice(0, 3);
  if (riskyTags.length) return riskyTags;
  return ["uncertainty"];
}

function containsRiskWord(text) {
  const value = String(text || "").toLowerCase();
  return /risk|failure|loss|uncertain|tradeoff|cost|delay|conflict/.test(value);
}

function containsConstraintWord(text) {
  const value = String(text || "").toLowerCase();
  return /constraint|limit|dependency|friction|resistance|pressure/.test(value);
}

function isRiskTag(tag) {
  const value = String(tag || "").toLowerCase();
  return /risk|uncertain|radical|loss|tradeoff/.test(value);
}

function isBenefitTag(tag) {
  const value = String(tag || "").toLowerCase();
  return /benefit|upside|growth|opportunity|win/.test(value);
}

function normalizeList(primary, fallback) {
  const src = Array.isArray(primary) && primary.length ? primary : fallback || [];
  const cleaned = src.map((item) => String(item || "").trim()).filter(Boolean);
  return cleaned.length ? cleaned : [];
}
