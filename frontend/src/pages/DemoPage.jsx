import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DEMO_SCENARIOS } from "../lib/templates.js";
import { fetchDemo } from "../lib/api.js";

export default function DemoPage() {
  const [loadingId, setLoadingId] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function loadDemo(id) {
    setError("");
    setLoadingId(id);
    try {
      const data = await fetchDemo(id);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingId("");
    }
  }

  return (
    <main className="demo-page">
      <section className="card">
        <p className="eyebrow">Judge-Safe Mode</p>
        <h1>Demo Scenarios</h1>
        <p>Load pre-generated scenarios instantly without live generation.</p>
        <div className="row">
          {DEMO_SCENARIOS.map((demo) => (
            <button key={demo.id} className="btn" onClick={() => loadDemo(demo.id)} disabled={loadingId === demo.id}>
              {loadingId === demo.id ? "Loading..." : demo.label}
            </button>
          ))}
          <Link className="btn btn-soft" to="/sim">
            Open Live Simulator
          </Link>
        </div>
      </section>

      {error && <section className="card error">{error}</section>}

      {result && (
        <section className="card">
          <h2>{result.title}</h2>
          <p>{result.eventText}</p>
          <p>
            Nodes: <strong>{result.graph?.nodes?.length || 0}</strong> | Edges:{" "}
            <strong>{result.graph?.edges?.length || 0}</strong>
          </p>
          <button className="btn btn-soft" onClick={() => navigate("/sim")}>
            Continue in Simulator
          </button>
        </section>
      )}
    </main>
  );
}
