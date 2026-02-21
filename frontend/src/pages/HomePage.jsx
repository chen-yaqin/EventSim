import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <main className="home">
      <section className="hero card">
        <p className="eyebrow">Counterfactual + Role Switch Simulation</p>
        <h1>EventSim</h1>
        <p>
          Explore how choices and perspectives shift outcomes. Generate a compact simulation graph, inspect nodes,
          and compare worlds with structured diffs.
        </p>
        <div className="row">
          <Link className="btn" to="/sim">
            Open Simulator
          </Link>
          <Link className="btn btn-soft" to="/demo">
            Open Demo Mode
          </Link>
        </div>
        <p className="disclaimer">
          For reflection and exploration only. Not professional medical, legal, or crisis advice.
        </p>
      </section>
    </main>
  );
}
