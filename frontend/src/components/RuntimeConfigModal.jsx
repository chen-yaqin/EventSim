const PROVIDERS = ["anthropic", "openai", "gemini"];

export default function RuntimeConfigModal({
  open,
  config,
  onChange,
  onSave,
  onReset,
  onClose
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal runtime-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Runtime Model Config</h3>
        <p className="muted">
          Fill API keys and model routing here. Settings stay in browser localStorage.
        </p>

        <div className="runtime-grid">
          <label>
            ANTHROPIC_API_KEY
            <input
              className="chat-input-inline"
              type="password"
              value={config.anthropicApiKey}
              onChange={(e) => onChange("anthropicApiKey", e.target.value)}
              placeholder="sk-ant-..."
            />
          </label>
          <label>
            OPENAI_API_KEY
            <input
              className="chat-input-inline"
              type="password"
              value={config.openaiApiKey}
              onChange={(e) => onChange("openaiApiKey", e.target.value)}
              placeholder="sk-proj-..."
            />
          </label>
          <label>
            GEMINI_API_KEY
            <input
              className="chat-input-inline"
              type="password"
              value={config.geminiApiKey}
              onChange={(e) => onChange("geminiApiKey", e.target.value)}
              placeholder="AIza..."
            />
          </label>
        </div>

        <h4>Global Fallback</h4>
        <div className="runtime-grid">
          <label>
            MODEL_PROVIDER
            <select value={config.modelProvider} onChange={(e) => onChange("modelProvider", e.target.value)}>
              {PROVIDERS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            MODEL
            <input
              className="chat-input-inline"
              value={config.model}
              onChange={(e) => onChange("model", e.target.value)}
              placeholder="claude-3-5-haiku-latest / gpt-4o-mini / gemini-2.0-flash"
            />
          </label>
        </div>

        <h4>Task Routing</h4>
        <div className="runtime-grid">
          <label>
            MODEL_BASIC_PROVIDER
            <select value={config.basicProvider} onChange={(e) => onChange("basicProvider", e.target.value)}>
              {PROVIDERS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            MODEL_BASIC
            <input
              className="chat-input-inline"
              value={config.basicModel}
              onChange={(e) => onChange("basicModel", e.target.value)}
              placeholder="model for plan/expand"
            />
          </label>
          <label>
            MODEL_CHATBOT_PROVIDER
            <select value={config.chatbotProvider} onChange={(e) => onChange("chatbotProvider", e.target.value)}>
              {PROVIDERS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            MODEL_CHATBOT
            <input
              className="chat-input-inline"
              value={config.chatbotModel}
              onChange={(e) => onChange("chatbotModel", e.target.value)}
              placeholder="model for chat"
            />
          </label>
          <label>
            MODEL_BRANCH_PROVIDER
            <select value={config.branchProvider} onChange={(e) => onChange("branchProvider", e.target.value)}>
              {PROVIDERS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            MODEL_BRANCH
            <input
              className="chat-input-inline"
              value={config.branchModel}
              onChange={(e) => onChange("branchModel", e.target.value)}
              placeholder="model for branch"
            />
          </label>
        </div>

        <div className="row">
          <button className="btn btn-soft" onClick={onReset}>
            Reset Local Settings
          </button>
          <button className="btn" onClick={onSave}>
            Save And Apply
          </button>
        </div>
      </div>
    </div>
  );
}
