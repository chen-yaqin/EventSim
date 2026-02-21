const ROLES = [
  { id: "you_now", label: "You-Now" },
  { id: "you_5y", label: "You-in-5-Years" },
  { id: "neutral_advisor", label: "Neutral Advisor" }
];

export default function ChatWidget({
  open,
  onToggle,
  selectedNode,
  roleId,
  onRoleChange,
  messages,
  input,
  onInputChange,
  onSend,
  loading
}) {
  return (
    <div className="chat-widget">
      <button className="chat-fab" onClick={onToggle}>
        {open ? "Close Chat" : "Role Chat"}
      </button>
      {open && (
        <section className="chat-panel card">
          <h4>Role Chatbot</h4>
          <p className="muted">Node: {selectedNode?.title || "No node selected"}</p>
          <div className="chat-role-row">
            <label>select a role</label>
            <select value={roleId} onChange={(e) => onRoleChange(e.target.value)}>
              {ROLES.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>
          <div className="chat-box">
            {(messages || []).map((msg) => (
              <div key={msg.id} className={`chat-line chat-${msg.sender}`}>
                <strong>{msg.sender === "user" ? "You" : msg.roleTitle || "Assistant"}:</strong> {msg.text}
              </div>
            ))}
            {!messages?.length && <p className="muted">Select a node and start asking questions.</p>}
          </div>
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Ask from selected role perspective..."
          />
          <button className="btn btn-soft" onClick={onSend} disabled={loading || !input.trim() || !selectedNode}>
            {loading ? "Sending..." : "Send"}
          </button>
        </section>
      )}
    </div>
  );
}
