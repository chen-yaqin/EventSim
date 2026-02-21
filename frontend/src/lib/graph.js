export function toReactFlow(graph, onToggleCollapse, onOpenBranch) {
  const { visibleNodes, visibleEdges, childCountById, depthById } = buildVisibleTree(graph);
  const byDepth = new Map();
  for (const node of visibleNodes) {
    const depth = depthById.get(node.id) || 0;
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth).push(node);
  }

  const flowNodes = [];
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  for (const depth of depths) {
    const row = byDepth.get(depth);
    const gapX = 300;
    const y = 60 + depth * 220;
    row.forEach((node, index) => {
      const width = (row.length - 1) * gapX;
      const x = 200 + index * gapX - width / 2;
      flowNodes.push({
        id: node.id,
        type: "worldNode",
        position: { x, y },
        data: {
          id: node.id,
          title: node.title,
          oneLiner: node.one_liner,
          tags: node.tags || [],
          confidence: node.confidence,
          collapsed: Boolean(node.collapsed),
          hasChildren: (childCountById.get(node.id) || 0) > 0,
          nodeType: node.type,
          onToggleCollapse,
          onOpenBranch
        },
        style: styleForType(node.type)
      });
    });
  }

  const flowEdges = visibleEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: edge.label === "counterfactual",
    style: { strokeWidth: 1.6 },
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
      width: 280,
      padding: 12
    };
  }

  return {
    background: "linear-gradient(135deg, #164e63, #0f766e)",
    color: "#f0fdfa",
    border: "1px solid #0d9488",
    borderRadius: 12,
    width: 280,
    padding: 10
  };
}
