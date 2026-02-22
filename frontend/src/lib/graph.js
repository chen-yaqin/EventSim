export function toReactFlow(graph, onToggleCollapse, onOpenBranch, onToggleCompare, compareIds = []) {
  const { visibleNodes, visibleEdges, childCountById, depthById } = buildVisibleTree(graph);
  const byDepth = new Map();
  for (const node of visibleNodes) {
    const depth = depthById.get(node.id) || 0;
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth).push(node);
  }

  const flowNodes = [];
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const rowMeta = new Map();
  for (const depth of depths) {
    const row = byDepth.get(depth);
    const estHeights = row.map((node) => estimateNodeHeight(node));
    rowMeta.set(depth, {
      maxHeight: Math.max(...estHeights, 180),
      estWidths: row.map((node) => estimateNodeWidth(node))
    });
  }

  let yCursor = 40;
  for (const depth of depths) {
    const row = byDepth.get(depth);
    const { maxHeight, estWidths } = rowMeta.get(depth);
    const gapX = 80;
    const rowWidth = estWidths.reduce((sum, w) => sum + w, 0) + Math.max(0, row.length - 1) * gapX;
    const y = yCursor;
    let xCursor = 260 - rowWidth / 2;
    row.forEach((node, index) => {
      const nodeWidth = estWidths[index] || 320;
      const x = xCursor;
      const titleShort = shortNodeTitle(node.title, 4);
      const orderIndex = depth * 8 + index;
      flowNodes.push({
        id: node.id,
        type: "worldNode",
        position: { x, y },
        className: "rf-node-cascade",
        data: {
          id: node.id,
          title: node.title,
          titleShort,
          oneLiner: node.one_liner,
          tags: node.tags || [],
          confidence: node.confidence,
          collapsed: Boolean(node.collapsed),
          hasChildren: (childCountById.get(node.id) || 0) > 0,
          nodeType: node.type,
          isCompareSelected: compareIds.includes(node.id),
          animationDelay: Math.min(520, orderIndex * 60),
          onToggleCollapse,
          onOpenBranch,
          onToggleCompare
        },
        style: styleForType(node.type)
      });
      xCursor += nodeWidth + gapX;
    });
    yCursor += maxHeight + 120;
  }

  const flowEdges = visibleEdges.map((edge, idx) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: edge.label === "counterfactual",
    className: "edge-cascade",
    style: {
      strokeWidth: 1.6,
      opacity: 0,
      animation: "edgeFadeIn 420ms ease-out forwards",
      animationDelay: `${Math.min(640, idx * 45)}ms`
    },
    labelStyle: { fontSize: 11 }
  }));

  return { nodes: flowNodes, edges: flowEdges };
}

function buildVisibleTree(graph) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map();
  for (const edge of graph.edges) {
    if (!childrenByParent.has(edge.source)) childrenByParent.set(edge.source, []);
    childrenByParent.get(edge.source).push(edge.target);
  }

  const childCountById = new Map();
  for (const node of graph.nodes) {
    childCountById.set(node.id, (childrenByParent.get(node.id) || []).length);
  }

  const roots = graph.nodes.filter((node) => !node.parentId);
  const visibleNodeIds = new Set();
  const depthById = new Map();

  for (const root of roots) {
    walk(root.id, 0);
  }

  function walk(nodeId, depth) {
    if (!nodeById.has(nodeId)) return;
    visibleNodeIds.add(nodeId);
    depthById.set(nodeId, depth);
    const node = nodeById.get(nodeId);
    if (node.collapsed) return;
    for (const childId of childrenByParent.get(nodeId) || []) {
      walk(childId, depth + 1);
    }
  }

  const visibleNodes = graph.nodes.filter((node) => visibleNodeIds.has(node.id));
  const visibleEdges = graph.edges.filter(
    (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
  );
  return { visibleNodes, visibleEdges, childCountById, depthById };
}

function styleForType(type) {
  if (type === "root") {
    return {
      background: "linear-gradient(135deg, #0f172a, #1e293b)",
      color: "#fff",
      border: "1px solid #334155",
      borderRadius: 14,
      width: 340,
      padding: 12
    };
  }

  return {
    background: "linear-gradient(135deg, #164e63, #0f766e)",
    color: "#f0fdfa",
    border: "1px solid #0d9488",
    borderRadius: 12,
    width: 340,
    padding: 10
  };
}

function estimateNodeHeight(node) {
  const title = String(node.title || "");
  const oneLiner = String(node.one_liner || "");
  const tags = Array.isArray(node.tags) ? node.tags.length : 0;
  const titleLines = Math.ceil(title.length / 30);
  const bodyLines = Math.ceil(oneLiner.length / 42);
  return 130 + titleLines * 24 + bodyLines * 22 + Math.ceil(tags / 3) * 28;
}

function estimateNodeWidth(node) {
  const title = String(node.title || "");
  if (title.length > 55) return 390;
  if (title.length > 35) return 360;
  return 340;
}

function shortNodeTitle(title, maxWords = 4) {
  const words = String(title || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "Node";
  return words.slice(0, maxWords).join(" ");
}
