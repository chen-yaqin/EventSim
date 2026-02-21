import { useMemo, useState } from "react";
import BranchModal from "../components/BranchModal.jsx";
import ChatWidget from "../components/ChatWidget.jsx";
import GraphCanvas from "../components/GraphCanvas.jsx";
import ScenarioForm from "../components/ScenarioForm.jsx";
import SidePanel from "../components/SidePanel.jsx";
import ToastStack from "../components/ToastStack.jsx";
import TopBar from "../components/TopBar.jsx";
import { fetchBranch, fetchChat, fetchExpand, fetchPlan } from "../lib/api.js";
import { toReactFlow } from "../lib/graph.js";

export default function SimPage() {
  const [demoMode, setDemoMode] = useState(false);
  const [callsUsed, setCallsUsed] = useState(0);
  const [form, setForm] = useState({
    eventText: "",
    timeframe: "1 year",
    stakes: "medium",
    goal: "growth"
  });
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [eventHash, setEventHash] = useState("");
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [loadingExpand, setLoadingExpand] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [roleId, setRoleId] = useState("you_now");
  const [chatByKey, setChatByKey] = useState({});
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [branchInput, setBranchInput] = useState("");
  const [branchLoading, setBranchLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchTargetId, setBranchTargetId] = useState(null);

  const selectedNode = useMemo(() => graph.nodes.find((n) => n.id === selectedId) || null, [graph, selectedId]);
  const branchTargetNode = useMemo(
    () => graph.nodes.find((n) => n.id === branchTargetId) || null,
    [graph, branchTargetId]
  );
  const flow = useMemo(
    () => toReactFlow(graph, handleToggleCollapse, openBranchModalForNode),
    [graph]
  );
  const chatKey = selectedNode ? `${selectedNode.id}:${roleId}` : "";
  const chatMessages = chatByKey[chatKey] || [];

  async function handleGenerate() {
    setLoadingPlan(true);
    try {
      const payload = {
        eventText: form.eventText.trim(),
        options: {
          timeframe: form.timeframe,
          stakes: form.stakes,
          goal: form.goal
        }
      };
      const result = await fetchPlan(payload);
      setGraph(result.graph);
      setEventHash(result.meta.eventHash);
      setSelectedId("root");
      setExpanded({});
      setChatByKey({});
      setChatInput("");
      setBranchInput("");
      setBranchModalOpen(false);
      setBranchTargetId(null);
      setCallsUsed((x) => x + 1);
      toast(result.meta.cache === "hit" ? "Loaded plan from cache" : "Graph generated", "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoadingPlan(false);
    }
  }

  async function handleNodeClick(_evt, node) {
    setSelectedId(node.id);
    setBranchInput("");
    if (expanded[node.id] || !eventHash) return;

    setLoadingExpand(true);
    try {
      const result = await fetchExpand({ eventHash, nodeId: node.id });
      setExpanded((prev) => ({ ...prev, [node.id]: result.details }));
      setCallsUsed((x) => x + 1);
      if (result.meta.cache === "hit") toast("Node details from cache", "info");
    } catch (error) {
      toast(error.message, error.status === 429 ? "warn" : "error");
    } finally {
      setLoadingExpand(false);
    }
  }

  async function handleSendChat() {
    if (!selectedNode || !chatInput.trim() || !eventHash) return;
    const userText = chatInput.trim();
    const roleChatKey = `${selectedNode.id}:${roleId}`;
    const previous = chatByKey[roleChatKey] || [];
    const userMessage = { id: `${Date.now()}_u`, sender: "user", text: userText };
    setChatByKey((prev) => ({ ...prev, [roleChatKey]: [...previous, userMessage] }));
    setChatInput("");
    setChatLoading(true);

    try {
      const result = await fetchChat({
        eventHash,
        nodeId: selectedNode.id,
        nodeTitle: selectedNode.title,
        roleId,
        message: userText,
        history: previous.map((item) => ({ sender: item.sender, text: item.text }))
      });
      const reply = result.reply;
      const assistantText = `${reply.answer}\n- ${reply.bullets.join("\n- ")}\nQ: ${reply.nextQuestion}`;
      const assistantMessage = {
        id: `${Date.now()}_a`,
        sender: "assistant",
        roleTitle: reply.roleTitle,
        text: assistantText
      };
      setChatByKey((prev) => ({ ...prev, [roleChatKey]: [...(prev[roleChatKey] || []), assistantMessage] }));
      setCallsUsed((x) => x + 1);
    } catch (error) {
      toast(error.message, error.status === 429 ? "warn" : "error");
    } finally {
      setChatLoading(false);
    }
  }

  async function handleBranchGenerate() {
    if (!branchTargetNode || branchTargetNode.type !== "world" || !branchInput.trim() || !eventHash) return;
    setBranchLoading(true);
    try {
      const result = await fetchBranch({
        eventHash,
        parentNodeId: branchTargetNode.id,
        parentTitle: branchTargetNode.title,
        userQuestion: branchInput.trim()
      });
      setGraph((prev) => mergeGraph(prev, result, branchTargetNode.id));
      setCallsUsed((x) => x + 1);
      setBranchInput("");
      setBranchModalOpen(false);
      toast(result.meta.cache === "hit" ? "Branch loaded from cache" : "Child worlds generated", "success");
    } catch (error) {
      toast(error.message, error.status === 429 ? "warn" : "error");
    } finally {
      setBranchLoading(false);
    }
  }

  function handleToggleCollapse(nodeId = selectedNode?.id) {
    if (!nodeId) return;
    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) =>
        node.id === nodeId ? { ...node, collapsed: !node.collapsed } : node
      )
    }));
  }

  function openBranchModalForNode(nodeId) {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== "world") return;
    setBranchTargetId(nodeId);
    setBranchModalOpen(true);
    setBranchInput("");
  }

  function handleExport() {
    if (!graph.nodes.length) return toast("No graph to export", "warn");
    const data = JSON.stringify({ graph, eventHash, form, expanded, chatByKey }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "eventsim-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopySummary() {
    if (!selectedNode) return;
    const details = expanded[selectedNode.id];
    const summary = [
      `Event: ${form.eventText || "N/A"}`,
      `Node: ${selectedNode.title}`,
      `One-liner: ${selectedNode.one_liner}`,
      `Consequences: ${(details?.consequences || []).join("; ")}`,
      `Next question: ${details?.next_question || "N/A"}`
    ].join("\n");
    navigator.clipboard.writeText(summary);
    toast("Summary copied", "success");
  }

  function toast(message, kind = "info") {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, kind }].slice(-4));
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2800);
  }

  return (
    <main className="sim-page">
      <TopBar demoMode={demoMode} onToggleDemo={setDemoMode} onExport={handleExport} callsUsed={callsUsed} />

      <div className="workspace">
        <div className="left">
          <ScenarioForm form={form} onChange={setForm} onGenerate={handleGenerate} loading={loadingPlan} />
          <GraphCanvas nodes={flow.nodes} edges={flow.edges} onNodeClick={handleNodeClick} />
        </div>

        <SidePanel
          selectedNode={selectedNode}
          details={selectedNode ? expanded[selectedNode.id] : null}
          loading={loadingExpand}
          onToggleCollapse={() => handleToggleCollapse()}
          onCopySummary={handleCopySummary}
        />
      </div>

      <ChatWidget
        open={chatOpen}
        onToggle={() => setChatOpen((v) => !v)}
        selectedNode={selectedNode}
        roleId={roleId}
        onRoleChange={setRoleId}
        messages={chatMessages}
        input={chatInput}
        onInputChange={setChatInput}
        onSend={handleSendChat}
        loading={chatLoading}
      />
      <BranchModal
        open={branchModalOpen}
        node={branchTargetNode}
        input={branchInput}
        onInputChange={setBranchInput}
        onGenerate={handleBranchGenerate}
        onClose={() => setBranchModalOpen(false)}
        loading={branchLoading}
      />
      <ToastStack items={toasts} />
    </main>
  );
}

function mergeGraph(current, branchPayload, parentNodeId) {
  const nodesById = new Map(
    current.nodes.map((node) => [
      node.id,
      node.id === parentNodeId ? { ...node, collapsed: false } : node
    ])
  );
  for (const node of branchPayload.nodes || []) {
    nodesById.set(node.id, {
      collapsed: false,
      ...node
    });
  }
  const edgesById = new Map(current.edges.map((edge) => [edge.id, edge]));
  for (const edge of branchPayload.edges || []) {
    edgesById.set(edge.id, edge);
  }
  return {
    nodes: [...nodesById.values()],
    edges: [...edgesById.values()]
  };
}
