const ROLES = [
  { id: "you_now", label: "You-Now" },
  { id: "you_5y", label: "You-in-5-Years" },
  { id: "neutral_advisor", label: "Neutral Advisor" },
  { id: "custom", label: "Custom Role" }
];

export default function ChatWidget({
  open,
  onToggle,
  selectedNode,
  roleId,
  onRoleChange,
  customRoleTitle,
  customRoleStyle,
  onCustomRoleTitleChange,
  onCustomRoleStyleChange,
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
          {roleId === "custom" && (
            <div className="chat-role-row">
              <label>custom role name</label>
              <input
                className="chat-input-inline"
                value={customRoleTitle}
                onChange={(e) => onCustomRoleTitleChange(e.target.value)}
                placeholder="e.g. Product Manager"
              />
              <label>custom role style</label>
              <input
                className="chat-input-inline"
                value={customRoleStyle}
                onChange={(e) => onCustomRoleStyleChange(e.target.value)}
                placeholder="e.g. user outcomes, scope-risk tradeoffs"
              />
            </div>
          )}
          <div className={`chat-box ${messages?.length ? "" : "chat-box-empty"}`}>
            {(messages || []).map((msg) => (
              <div key={msg.id} className={`chat-line chat-${msg.sender}`}>
                <strong>{msg.sender === "user" ? "You" : msg.roleTitle || "Assistant"}:</strong> {msg.text}
              </div>
            ))}
            {!messages?.length && <p className="muted chat-empty-hint">Select a node and start asking questions.</p>}
          </div>

          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Ask from selected role perspective..."
          />
          <button
            className="btn btn-soft"
            onClick={onSend}
            disabled={
              loading ||
              !input.trim() ||
              !selectedNode ||
              (roleId === "custom" && !customRoleTitle.trim())
            }
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </section>
      )}
    </div>
  );
}
