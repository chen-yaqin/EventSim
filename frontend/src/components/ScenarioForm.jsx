import { SCENARIO_TEMPLATES } from "../lib/templates.js";

export default function ScenarioForm({ form, onChange, onGenerate, loading }) {
  return (
    <section className="card scenario-form">
      <h2>Choose or Enter Event</h2>
      <div className="template-grid">
        {SCENARIO_TEMPLATES.map((tpl) => (
          <button key={tpl.id} className="template-card" onClick={() => onChange({ ...form, eventText: tpl.eventText })}>
            {tpl.label}
          </button>
        ))}
      </div>

      <textarea
        value={form.eventText}
        placeholder="Describe an event..."
        onChange={(e) => onChange({ ...form, eventText: e.target.value })}
      />

      <div className="row">
        <select value={form.timeframe} onChange={(e) => onChange({ ...form, timeframe: e.target.value })}>
          <option>1 month</option>
          <option>1 year</option>
          <option>5 years</option>
        </select>
        <select value={form.stakes} onChange={(e) => onChange({ ...form, stakes: e.target.value })}>
          <option>low</option>
          <option>medium</option>
          <option>high</option>
        </select>
        <select value={form.goal} onChange={(e) => onChange({ ...form, goal: e.target.value })}>
          <option>growth</option>
          <option>stability</option>
          <option>happiness</option>
          <option>impact</option>
        </select>
      </div>
      <div className="row">
        <label>
          <input
            type="checkbox"
            checked={Boolean(form.useCache)}
            onChange={(e) => onChange({ ...form, useCache: e.target.checked })}
          />{" "}
          Use cache
        </label>
      </div>

      <button className="btn" disabled={loading || !form.eventText.trim()} onClick={onGenerate}>
        {loading ? "Generating..." : "Generate Graph"}
      </button>
    </section>
  );
}
