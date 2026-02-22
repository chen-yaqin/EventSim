import { useEffect, useMemo, useState } from "react";
import BranchModal from "../components/BranchModal.jsx";
import ChatWidget from "../components/ChatWidget.jsx";
import CompareModal from "../components/CompareModal.jsx";
import GraphCanvas from "../components/GraphCanvas.jsx";
import RuntimeConfigModal from "../components/RuntimeConfigModal.jsx";
import ScenarioForm from "../components/ScenarioForm.jsx";
import SidePanel from "../components/SidePanel.jsx";
import ToastStack from "../components/ToastStack.jsx";
import TopBar from "../components/TopBar.jsx";
import {
  applyRuntimeConfig,
  clearRuntimeConfig,
  fetchBranch,
  fetchChat,
  fetchDemo,
  fetchExpand,
  fetchPlan,
  loadRuntimeConfig,
  saveRuntimeConfig
} from "../lib/api.js";
import { toReactFlow } from "../lib/graph.js";

export default function SimPage() {
  const [demoMode, setDemoMode] = useState(false);
  const [callsUsed, setCallsUsed] = useState(0);
  const [form, setForm] = useState({
    eventText: "",
    timeframe: "1 year",
    stakes: "medium",
    goal: "growth",
    useCache: true
  });
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [eventHash, setEventHash] = useState("");
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [loadingExpand, setLoadingExpand] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [roleId, setRoleId] = useState("you_now");
  const [customRoleTitle, setCustomRoleTitle] = useState("");
  const [customRoleStyle, setCustomRoleStyle] = useState("");
  const [chatByKey, setChatByKey] = useState({});
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [branchInput, setBranchInput] = useState("");
  const [branchChildCount, setBranchChildCount] = useState(3);
  const [branchChildCountByNode, setBranchChildCountByNode] = useState({});
  const [branchLoading, setBranchLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchTargetId, setBranchTargetId] = useState(null);
  const [compareIds, setCompareIds] = useState([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [runtimeConfigOpen, setRuntimeConfigOpen] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState(() => loadRuntimeConfig());

  const selectedNode = useMemo(() => graph.nodes.find((n) => n.id === selectedId) || null, [graph, selectedId]);
  const branchTargetNode = useMemo(
    () => graph.nodes.find((n) => n.id === branchTargetId) || null,
    [graph, branchTargetId]
  );
  const flow = useMemo(
    () => toReactFlow(graph, handleToggleCollapse, openBranchModalForNode, handleToggleCompareNode, compareIds),
    [graph, compareIds]
  );
  const chatKey = selectedNode ? `${selectedNode.id}:${roleId}` : "";
  const chatMessages = chatByKey[chatKey] || [];
  const compareNodes = useMemo(() => compareIds.map((id) => graph.nodes.find((n) => n.id === id)).filter(Boolean), [compareIds, graph.nodes]);
  const compareLeft = compareNodes[0] || null;
  const compareRight = compareNodes[1] || null;
  const runtimeConfigured = Boolean(
    runtimeConfig.anthropicApiKey || runtimeConfig.openaiApiKey || runtimeConfig.geminiApiKey
  );

  useEffect(() => {
    applyRuntimeConfig(runtimeConfig);
  }, [runtimeConfig]);

  async function handleGenerate() {
    setLoadingPlan(true);
    try {
      if (demoMode) {
        const demo = await fetchDemo("offer-decision");
        setGraph(demo.graph || { nodes: [], edges: [] });
        setEventHash(demo.meta?.eventHash || `demo_${demo.id || "offer_decision"}`);
        setSelectedId("root");
        setExpanded({});
        setChatByKey({});
        setChatInput("");
        setBranchInput("");
        setBranchChildCount(3);
        setBranchChildCountByNode({});
        setBranchModalOpen(false);
        setBranchTargetId(null);
        setCompareIds([]);
        setCompareOpen(false);
        setCallsUsed((x) => x + 1);
        toast("Demo graph loaded (no API key required)", "success");
        return;
      }
      const payload = {
        eventText: form.eventText.trim(),
        options: {
          timeframe: form.timeframe,
          stakes: form.stakes,
          goal: form.goal
        },
        useCache: form.useCache
      };
      const result = await fetchPlan(payload);
      setGraph(result.graph);
      setEventHash(result.meta.eventHash);
      setSelectedId("root");
      setExpanded({});
      setChatByKey({});
      setChatInput("");
      setBranchInput("");
      setBranchChildCount(3);
      setBranchChildCountByNode({});
      setBranchModalOpen(false);
      setBranchTargetId(null);
      setCompareIds([]);
      setCompareOpen(false);
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
      const currentNode = graph.nodes.find((n) => n.id === node.id) || null;
      const lineage = buildLineage(graph.nodes, node.id);
      const result = await fetchExpand({
        eventHash,
        nodeId: node.id,
        nodeTitle: currentNode?.title || "",
        nodeType: currentNode?.type || "",
        nodeOneLiner: currentNode?.one_liner || "",
        nodeDelta: currentNode?.delta || "",
        nodeTags: Array.isArray(currentNode?.tags) ? currentNode.tags : [],
        parentId: currentNode?.parentId || null,
        lineage,
        useCache: form.useCache
      });
      setExpanded((prev) => ({ ...prev, [node.id]: result.details }));
      setCallsUsed((x) => x + 1);
      if (result.meta.cache === "hit") toast("Node details from cache", "info");
    } catch (error) {
      toast(error.message, error.status === 429 ? "warn" : "error");
    } finally {
      setLoadingExpand(false);
    }
  }

  function handleNodeDoubleClick(_evt, node) {
    if (!node?.id || node.id === "root") return;
    openBranchModalForNode(node.id);
  }

  async function handleSendChat() {
    if (!selectedNode || !chatInput.trim() || !eventHash) return;
    if (roleId === "custom" && !customRoleTitle.trim()) {
      toast("Custom role name is required", "warn");
      return;
    }
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
        customRoleTitle: roleId === "custom" ? customRoleTitle.trim() : "",
        customRoleStyle: roleId === "custom" ? customRoleStyle.trim() : "",
        message: userText,
        history: previous.map((item) => ({ sender: item.sender, text: item.text })),
        useCache: form.useCache
      });
      const reply = result.reply || {};
      const safeBullets = Array.isArray(reply.bullets) && reply.bullets.length
        ? reply.bullets
        : ["Clarify your key assumption", "Choose one reversible next step", "Set a short review checkpoint"];
      const assistantText = `${reply.answer || "I could not generate a model response, using fallback guidance."}\n- ${safeBullets.join(
        "\n- "
      )}\nQ: ${reply.nextQuestion || "What should we test in the next 48 hours?"}`;
      const assistantMessage = {
        id: `${Date.now()}_a`,
        sender: "assistant",
        roleTitle: reply.roleTitle,
        text: assistantText
      };
      setChatByKey((prev) => ({ ...prev, [roleChatKey]: [...(prev[roleChatKey] || []), assistantMessage] }));
      setCallsUsed((x) => x + 1);
    } catch (error) {
      const fallbackMessage = {
        id: `${Date.now()}_e`,
        sender: "assistant",
        roleTitle: "Fallback Assistant",
        text: "Model response failed. Try again, or continue with one concrete next step and a 48-hour checkpoint."
      };
      setChatByKey((prev) => ({ ...prev, [roleChatKey]: [...(prev[roleChatKey] || []), fallbackMessage] }));
      toast(error.message, error.status === 429 ? "warn" : "error");
    } finally {
      setChatLoading(false);
    }
  }

  async function handleBranchGenerate() {
    if (!branchTargetNode || branchTargetNode.type !== "world" || !branchInput.trim() || !eventHash) return;
    const normalizedChildCount = normalizeChildCount(branchChildCount);
    setBranchLoading(true);
    try {
      const lineage = buildLineage(graph.nodes, branchTargetNode.id);
      const result = await fetchBranch({
        eventHash,
        parentNodeId: branchTargetNode.id,
        parentTitle: branchTargetNode.title,
        parentBranchLabel: branchTargetNode.data?.branchLabel || "",
        parentOneLiner: branchTargetNode.one_liner || "",
        parentDelta: branchTargetNode.delta || "",
        parentTags: Array.isArray(branchTargetNode.tags) ? branchTargetNode.tags : [],
        userQuestion: branchInput.trim(),
        childCount: normalizedChildCount,
        lineage,
        useCache: form.useCache
      });
      setGraph((prev) => mergeGraph(prev, result, branchTargetNode.id));
      setBranchChildCountByNode((prev) => ({
        ...prev,
        [branchTargetNode.id]: normalizedChildCount
      }));
      setCallsUsed((x) => x + 1);
      setBranchInput("");
      setBranchChildCount(normalizedChildCount);
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
    setBranchChildCount(branchChildCountByNode[nodeId] ?? 3);
  }

  function handleToggleCompareNode(nodeId = selectedNode?.id) {
    if (!nodeId) return;
    setCompareIds((prev) => {
      if (prev.includes(nodeId)) return prev.filter((id) => id !== nodeId);
      if (prev.length >= 2) return [prev[1], nodeId];
      return [...prev, nodeId];
    });
  }

  async function handleOpenCompare() {
    if (compareNodes.length !== 2) {
      toast("Select 2 nodes first for compare", "warn");
      return;
    }
    const selectedIds = compareNodes.map((node) => node.id);
    const missing = selectedIds.filter((id) => !expanded[id]);
    if (missing.length && eventHash) {
      try {
        setLoadingExpand(true);
        const responses = await Promise.all(
          missing.map(async (id) => {
            const currentNode = graph.nodes.find((n) => n.id === id);
            if (!currentNode) return null;
            const result = await fetchExpand({
              eventHash,
              nodeId: id,
              nodeTitle: currentNode.title || "",
              nodeType: currentNode.type || "",
              nodeOneLiner: currentNode.one_liner || "",
              nodeDelta: currentNode.delta || "",
              nodeTags: Array.isArray(currentNode.tags) ? currentNode.tags : [],
              parentId: currentNode.parentId || null,
              lineage: buildLineage(graph.nodes, id),
              useCache: form.useCache
            });
            return { id, details: result.details || null };
          })
        );
        const loaded = {};
        for (const item of responses) {
          if (!item) continue;
          loaded[item.id] = item.details;
        }
        if (Object.keys(loaded).length) {
          setExpanded((prev) => ({ ...prev, ...loaded }));
          setCallsUsed((x) => x + Object.keys(loaded).length);
        }
      } catch (error) {
        toast(`Compare details partial: ${error.message}`, "warn");
      } finally {
        setLoadingExpand(false);
      }
    }
    setCompareOpen(true);
  }

  function handleExportCompareConclusion(text) {
    const body = String(text || "").trim();
    if (!body) return;
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `branch-compare-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    navigator.clipboard.writeText(body).catch(() => {});
    toast("Conclusion exported (and copied)", "success");
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

  async function handleOpenLineageWindow() {
    if (!selectedNode) return;
    const win = window.open("", "_blank", "width=920,height=700");
    if (!win) {
      toast("Popup blocked. Please allow popups for this site.", "warn");
      return;
    }
    try {
      win.opener = null;
    } catch {
      // Ignore if browser forbids changing opener.
    }
    win.document.write("<title>EventSim Lineage</title><body><p>Loading lineage...</p></body>");
    win.document.close();

    const lineage = buildLineage(graph.nodes, selectedNode.id);
    const detailsByNodeId = {};
    for (const item of lineage) {
      detailsByNodeId[item.id] = expanded[item.id] || null;
    }

    if (eventHash) {
      try {
        const missing = lineage.filter((item) => !detailsByNodeId[item.id]);
        const responses = await Promise.all(
          missing.map(async (item) => {
            const currentNode = graph.nodes.find((n) => n.id === item.id);
            if (!currentNode) return null;
            const result = await fetchExpand({
              eventHash,
              nodeId: item.id,
              nodeTitle: currentNode.title || "",
              nodeType: currentNode.type || "",
              nodeOneLiner: currentNode.one_liner || "",
              nodeDelta: currentNode.delta || "",
              nodeTags: Array.isArray(currentNode.tags) ? currentNode.tags : [],
              parentId: currentNode.parentId || null,
              lineage: buildLineage(graph.nodes, item.id),
              useCache: form.useCache
            });
            return { nodeId: item.id, details: result.details || null };
          })
        );
        const loaded = {};
        for (const item of responses) {
          if (!item) continue;
          loaded[item.nodeId] = item.details;
          detailsByNodeId[item.nodeId] = item.details;
        }
        if (Object.keys(loaded).length > 0) {
          setExpanded((prev) => ({ ...prev, ...loaded }));
          setCallsUsed((x) => x + Object.keys(loaded).length);
        }
      } catch (error) {
        toast(`Lineage details partial: ${error.message}`, "warn");
      }
    }

    renderLineageWindow(win, lineage, detailsByNodeId);
  }

  function toast(message, kind = "info") {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, kind }].slice(-4));
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2800);
  }

  return (
    <main className="sim-page">
      <TopBar
        demoMode={demoMode}
        onToggleDemo={setDemoMode}
        onExport={handleExport}
        callsUsed={callsUsed}
        onOpenCompare={handleOpenCompare}
        compareReady={compareNodes.length === 2}
        onOpenRuntimeConfig={() => setRuntimeConfigOpen(true)}
        runtimeConfigured={runtimeConfigured}
      />

      <div className="workspace">
        <div className="left">
          <ScenarioForm form={form} onChange={setForm} onGenerate={handleGenerate} loading={loadingPlan} />
          <GraphCanvas
            nodes={flow.nodes}
            edges={flow.edges}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
          />
        </div>

        <SidePanel
          selectedNode={selectedNode}
          details={selectedNode ? expanded[selectedNode.id] : null}
          loading={loadingExpand}
          onToggleCollapse={() => handleToggleCollapse()}
          onCopySummary={handleCopySummary}
          onOpenLineageWindow={handleOpenLineageWindow}
          onToggleCompare={() => handleToggleCompareNode()}
          compareSelected={Boolean(selectedNode && compareIds.includes(selectedNode.id))}
        />
      </div>

      <ChatWidget
        open={chatOpen}
        onToggle={() => setChatOpen((v) => !v)}
        selectedNode={selectedNode}
        roleId={roleId}
        onRoleChange={setRoleId}
        customRoleTitle={customRoleTitle}
        customRoleStyle={customRoleStyle}
        onCustomRoleTitleChange={setCustomRoleTitle}
        onCustomRoleStyleChange={setCustomRoleStyle}
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
        childCount={branchChildCount}
        onInputChange={setBranchInput}
        onChildCountChange={setBranchChildCount}
        onGenerate={handleBranchGenerate}
        onClose={() => setBranchModalOpen(false)}
        loading={branchLoading}
      />
      <CompareModal
        open={compareOpen}
        left={compareLeft}
        right={compareRight}
        leftDetails={compareLeft ? expanded[compareLeft.id] : null}
        rightDetails={compareRight ? expanded[compareRight.id] : null}
        onClose={() => setCompareOpen(false)}
        onExport={handleExportCompareConclusion}
      />
      <RuntimeConfigModal
        open={runtimeConfigOpen}
        config={runtimeConfig}
        onChange={(key, value) => setRuntimeConfig((prev) => ({ ...prev, [key]: value }))}
        onSave={() => {
          const saved = saveRuntimeConfig(runtimeConfig);
          setRuntimeConfig(saved);
          setRuntimeConfigOpen(false);
          toast("Runtime config saved and applied", "success");
        }}
        onReset={() => {
          const cleared = clearRuntimeConfig();
          setRuntimeConfig(cleared);
          toast("Runtime config cleared", "info");
        }}
        onClose={() => setRuntimeConfigOpen(false)}
      />
      <ToastStack items={toasts} />
    </main>
  );
}

function buildLineage(nodes, nodeId) {
  const map = new Map(nodes.map((node) => [node.id, node]));
  const chain = [];
  let current = map.get(nodeId);
  while (current) {
    chain.push({
      id: current.id,
      title: current.title,
      one_liner: current.one_liner,
      delta: current.delta,
      tags: Array.isArray(current.tags) ? current.tags : [],
      input_text: current.type === "root" ? current.data?.eventText || "" : ""
    });
    if (!current.parentId) break;
    current = map.get(current.parentId);
  }
  return chain.reverse();
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

function normalizeChildCount(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(8, parsed));
}

function renderLineageWindow(win, lineage = [], detailsByNodeId = {}) {
  const safeLineage = Array.isArray(lineage) ? lineage : [];
  const escapedData = JSON.stringify({ lineage: safeLineage, detailsByNodeId }).replace(/</g, "\\u003c");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EventSim Lineage</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card: #ffffff;
      --ink: #0f172a;
      --muted: #475569;
      --line: #dbeafe;
      --accent: #0e7490;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Space Grotesk", "Segoe UI", sans-serif;
      color: var(--ink);
      background: radial-gradient(circle at 8% 0%, #e0f2fe 0, transparent 35%), var(--bg);
      padding: 20px;
    }
    h2 { margin: 0 0 8px; }
    p { margin: 0 0 14px; color: var(--muted); }
    .crumb {
      margin: 0 0 12px;
      font-size: 12px;
      color: #64748b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .lineage-wrap {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      padding: 6px 2px 10px;
      margin-bottom: 18px;
      scrollbar-width: thin;
    }
    .lineage-node {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--card);
      padding: 10px 12px;
      cursor: pointer;
      min-width: 220px;
      max-width: 260px;
      text-align: left;
      transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease;
    }
    .lineage-node:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 18px rgba(14, 116, 144, 0.14);
      border-color: #7dd3fc;
    }
    .lineage-node.active { border-color: var(--accent); box-shadow: 0 0 0 2px #bae6fd; }
    .node-short {
      display: block;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .node-step {
      display: inline-block;
      font-size: 11px;
      border-radius: 999px;
      padding: 1px 6px;
      border: 1px solid #bfdbfe;
      background: #eff6ff;
      color: #334155;
      margin-bottom: 6px;
    }
    .node-desc {
      color: #64748b;
      font-size: 12px;
      line-height: 1.35;
    }
    .arrow {
      align-self: center;
      color: #64748b;
      font-size: 18px;
      user-select: none;
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.38);
      display: none;
      place-items: center;
      z-index: 20;
      padding: 16px;
    }
    .modal-backdrop.open {
      display: grid;
    }
    .detail-modal {
      border: 1px solid #cbd5e1;
      border-radius: 14px;
      background: #fff;
      padding: 14px;
      width: min(900px, 100%);
      max-height: min(78vh, 760px);
      overflow-y: auto;
    }
    .detail-head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      margin-bottom: 8px;
    }
    .detail-modal h3 { margin: 0; }
    .detail-modal ul { margin: 8px 0; padding-left: 20px; }
    .detail-kpi {
      display: grid;
      gap: 8px;
      margin: 8px 0 12px;
    }
    .detail-item {
      border: 1px solid #dbeafe;
      border-radius: 10px;
      background: #f8fbff;
      padding: 8px 10px;
      font-size: 14px;
    }
    .close-btn {
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      border-radius: 10px;
      padding: 5px 10px;
      cursor: pointer;
      font: inherit;
    }
    .chip-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .chip {
      font-size: 12px;
      border-radius: 999px;
      padding: 3px 8px;
      border: 1px solid #bae6fd;
      background: #f0f9ff;
    }
  </style>
</head>
<body>
  <h2>Lineage Chain</h2>
  <p>Nodes are shown left to right. Click a node to open details.</p>
  <div id="crumb" class="crumb"></div>
  <div id="lineage" class="lineage-wrap"></div>
  <div id="modal" class="modal-backdrop">
    <div id="detail" class="detail-modal"></div>
  </div>
  <script>
    const state = ${escapedData};
    const lineageEl = document.getElementById("lineage");
    const crumbEl = document.getElementById("crumb");
    const modalEl = document.getElementById("modal");
    const detailEl = document.getElementById("detail");
    let activeId = state.lineage.length ? state.lineage[state.lineage.length - 1].id : null;

    function renderList() {
      lineageEl.innerHTML = "";
      state.lineage.forEach((node, idx) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "lineage-node" + (node.id === activeId ? " active" : "");
        const isRoot = node.id === "root";
        const shortTitle = isRoot
          ? (node.title || rootShortLabel(node.input_text || node.id))
          : shortLabel(node.title || node.id);
        const description = isRoot
          ? (node.input_text || node.one_liner || "No description")
          : (node.one_liner || "No description");
        item.innerHTML =
          '<span class="node-step">Step ' + (idx + 1) + "</span>" +
          '<span class="node-short">' + escapeHtml(shortTitle) + "</span>" +
          '<div class="node-desc">' + escapeHtml(description) + "</div>";
        item.addEventListener("click", () => {
          activeId = node.id;
          renderList();
          renderBreadcrumb();
          openDetailModal();
        });
        lineageEl.appendChild(item);
        if (idx < state.lineage.length - 1) {
          const arrow = document.createElement("span");
          arrow.className = "arrow";
          arrow.textContent = "→";
          lineageEl.appendChild(arrow);
        }
      });
    }

    function renderDetail() {
      const node = state.lineage.find((x) => x.id === activeId) || state.lineage[0];
      if (!node) {
        detailEl.innerHTML = "<p>No lineage node found.</p>";
        return;
      }
      const details = state.detailsByNodeId[node.id] || null;
      const consequences = Array.isArray(details?.consequences) ? details.consequences : [];
      const tags = Array.isArray(node.tags) ? node.tags : [];
      const topEffects = consequences.slice(0, 2);
      const riskText = (details?.risk_flags || []).join(", ") || "uncertainty";
      const nextText = details?.next_question || "What should we test next?";
      detailEl.innerHTML =
        '<div class="detail-head">' +
        "<h3>📍 " + escapeHtml(node.title || node.id) + "</h3>" +
        '<button id="closeBtn" class="close-btn" type="button">Close</button>' +
        "</div>" +
        '<div class="detail-kpi">' +
        '<div class="detail-item"><strong>✨ Quick View:</strong> <em>' + escapeHtml(node.one_liner || "-") + "</em></div>" +
        '<div class="detail-item"><strong>⚠️ Risk:</strong> ' + escapeHtml(riskText) + "</div>" +
        '<div class="detail-item"><strong>🎯 Next:</strong> <strong>' + escapeHtml(nextText) + "</strong></div>" +
        "</div>" +
        (topEffects.length
          ? "<h4>📌 Top Effects</h4><ul>" + topEffects.map((item) => "<li>" + escapeHtml(item) + "</li>").join("") + "</ul>"
          : "<p>No expanded effects yet.</p>") +
        "<p class='muted'><strong>Why:</strong> " + escapeHtml(details?.why_it_changes || node.delta || "Not expanded yet") + "</p>" +
        (tags.length
          ? '<div class="chip-row">' + tags.map((tag) => '<span class="chip">' + escapeHtml(tag) + "</span>").join("") + "</div>"
          : "");
      const closeBtn = document.getElementById("closeBtn");
      if (closeBtn) {
        closeBtn.addEventListener("click", closeDetailModal);
      }
    }

    function renderBreadcrumb() {
      const chain = state.lineage
        .map((node) => shortLabel(node.title || node.id))
        .join(" > ");
      const current = state.lineage.find((x) => x.id === activeId);
      const currentText = current ? shortLabel(current.title || current.id) : "Node";
      crumbEl.textContent = "Timeline: " + chain + " | Current: " + currentText;
    }

    function openDetailModal() {
      renderDetail();
      modalEl.classList.add("open");
    }

    function closeDetailModal() {
      modalEl.classList.remove("open");
    }

    function shortLabel(text) {
      const words = String(text || "").trim().split(/\\s+/).filter(Boolean);
      if (words.length === 0) return "Node";
      return words.slice(0, 2).join(" ");
    }

    function rootShortLabel(text) {
      const raw = String(text || "").trim();
      if (!raw) return "Root";
      const words = raw.split(/\\s+/).filter(Boolean);
      if (words.length > 0) return words.slice(0, 3).join(" ");
      return raw.slice(0, 10);
    }

    function escapeHtml(text) {
      return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) closeDetailModal();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDetailModal();
    });

    renderList();
    renderBreadcrumb();
  </script>
</body>
</html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
