const ROLES = [
  { id: "you_now", label: "You-Now" },
  { id: "you_5y", label: "You-in-5-Years" },
  { id: "neutral_advisor", label: "Neutral Advisor" }
];

export default function SidePanel({
  selectedNode,
  details,
  loading,
  roleId,
  onRoleChange,
  chatMessages,
  chatInput,
  onChatInputChange,
  onSendChat,
  chatLoading,
  branchInput,
  onBranchInputChange,
  onBranchGenerate,
  branchLoading,
  onToggleCollapse,
  onCopySummary
}) {
  if (!selectedNode) {
    return (
      <aside className="card side-panel">
        <h3>Node Workspace</h3>
        <p>Select a world node to inspect details, chat by role, and continue branching.</p>
      </aside>
    );
  }

  const canBranch = selectedNode.type === "world";

  return (
    <aside className="card side-panel">
      <h3>{selectedNode.title}</h3>
      <p className="muted">{selectedNode.one_liner}</p>
      <div className="chip-row">
        {(selectedNode.tags || []).map((tag) => (
          <span key={tag} className="chip">
            {tag}
          </span>
        ))}
      </div>
      <p className="confidence">Confidence: {selectedNode.confidence ?? "-"}</p>

      {loading ? (
        <div className="skeleton-list">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : details ? (
        <>
          <h4>Consequences</h4>
          <ul>
            {details.consequences?.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h4>Why It Changes</h4>
          <p>{details.why_it_changes}</p>
          <h4>Next Question</h4>
          <p>{details.next_question}</p>
        </>
      ) : (
        <p>No expanded details yet.</p>
      )}

      <h4>Role Chatbot</h4>
      <select value={roleId} onChange={(e) => onRoleChange(e.target.value)}>
        {ROLES.map((role) => (
          <option key={role.id} value={role.id}>
            {role.label}
          </option>
        ))}
      </select>
      <div className="chat-box">
        {(chatMessages || []).map((msg) => (
          <div key={msg.id} className={`chat-line chat-${msg.sender}`}>
            <strong>{msg.sender === "user" ? "You" : msg.roleTitle || "Assistant"}:</strong> {msg.text}
          </div>
        ))}
        {!chatMessages?.length && <p className="muted">Start a conversation for this node and role.</p>}
      </div>
      <textarea
        value={chatInput}
        onChange={(e) => onChatInputChange(e.target.value)}
        placeholder="Ask this role how to evaluate this world..."
      />
      <button className="btn btn-soft" onClick={onSendChat} disabled={chatLoading || !chatInput.trim()}>
        {chatLoading ? "Sending..." : "Send"}
      </button>

      <h4>Branch This Node</h4>
      <p className="muted">Ask a follow-up question to generate {selectedNode.title} -> child worlds (1/2/3).</p>
      <textarea
        value={branchInput}
        onChange={(e) => onBranchInputChange(e.target.value)}
        placeholder="Example: What if we optimize for retention over speed?"
      />
      <button className="btn" onClick={onBranchGenerate} disabled={!canBranch || branchLoading || !branchInput.trim()}>
        {branchLoading ? "Generating..." : "Generate Child Worlds"}
      </button>

      <div className="row">
        <button className="btn btn-soft" onClick={onToggleCollapse}>
          {selectedNode.collapsed ? "Expand Node" : "Collapse Node"}
        </button>
        <button className="btn btn-soft" onClick={onCopySummary}>
          Copy Summary
        </button>
      </div>
    </aside>
  );
}
