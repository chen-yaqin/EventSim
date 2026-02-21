import { useMemo, useState } from "react";
import CompareModal from "../components/CompareModal.jsx";
import GraphCanvas from "../components/GraphCanvas.jsx";
import ScenarioForm from "../components/ScenarioForm.jsx";
import SidePanel from "../components/SidePanel.jsx";
import ToastStack from "../components/ToastStack.jsx";
import TopBar from "../components/TopBar.jsx";
import { fetchExpand, fetchPlan } from "../lib/api.js";
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
  const [compareOpen, setCompareOpen] = useState(false);
  const [pinned, setPinned] = useState([]);
  const [toasts, setToasts] = useState([]);

  const selectedNode = useMemo(() => graph.nodes.find((n) => n.id === selectedId) || null, [graph, selectedId]);
  const flow = useMemo(() => toReactFlow(graph), [graph]);
  const leftPinned = pinned[0] || selectedNode;
  const rightPinned = pinned[1] || null;

  async function handleGenerate() {
    setLoadingPlan(true);
    try {
      const payload = {
        eventText: form.eventText.trim(),
        options: {
          timeframe: form.timeframe,
          stakes: form.stakes,
          goal: form.goal,
          worldCount: 3,
          roleCount: 3
        }
      };
      const result = await fetchPlan(payload);
      setGraph(result.graph);
      setEventHash(result.meta.eventHash);
      setSelectedId(null);
      setExpanded({});
      setPinned([]);
      setCallsUsed((x) => x + 1);
      toast(result.meta.cache === "hit" ? "Loaded from cache" : "Graph generated", "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoadingPlan(false);
    }
  }

  async function handleNodeClick(_evt, node) {
    setSelectedId(node.id);
    if (expanded[node.id]) {
      toast("Loaded from cache", "info");
      return;
    }
    if (!eventHash) return;

    setLoadingExpand(true);
    try {
      const result = await fetchExpand({ eventHash, nodeId: node.id });
      setExpanded((prev) => ({ ...prev, [node.id]: result.details }));
      setCallsUsed((x) => x + 1);
      toast(result.meta.cache === "hit" ? "Loaded from cache" : "Expanded node", "success");
    } catch (error) {
      toast(error.message, error.status === 429 ? "warn" : "error");
    } finally {
      setLoadingExpand(false);
    }
  }

  function handleExport() {
    if (!graph.nodes.length) return toast("No graph to export", "warn");
    const data = JSON.stringify({ graph, eventHash, form, expanded }, null, 2);
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

  function handlePin() {
    if (!selectedNode) return;
    setPinned((prev) => {
      if (prev.some((n) => n.id === selectedNode.id)) return prev;
      if (prev.length === 2) return [prev[1], selectedNode];
      return [...prev, selectedNode];
    });
    toast("Pinned for compare", "info");
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
          onCompare={() => setCompareOpen(true)}
          onPin={handlePin}
          onCopySummary={handleCopySummary}
        />
      </div>

      <CompareModal open={compareOpen} left={leftPinned} right={rightPinned} onClose={() => setCompareOpen(false)} />
      <ToastStack items={toasts} />
    </main>
  );
}
