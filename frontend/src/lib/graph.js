export function toReactFlow(graph) {
  const levels = {
    root: 0,
    world: 1,
    role: 2
  };

  const grouped = { 0: [], 1: [], 2: [] };
  graph.nodes.forEach((node) => grouped[levels[node.type]].push(node));

  const flowNodes = [];
  for (const level of [0, 1, 2]) {
    const row = grouped[level];
    const gapX = 280;
    const y = 80 + level * 210;
    row.forEach((node, index) => {
      const width = (row.length - 1) * gapX;
      const x = 180 + index * gapX - width / 2;
      flowNodes.push({
        id: node.id,
        type: "default",
        position: { x, y },
        data: {
          label: `${node.title}\n${node.one_liner}`,
          kind: node.type,
          tags: node.tags,
          confidence: node.confidence
        },
        style: styleForType(node.type)
      });
    });
  }

  const flowEdges = graph.edges.map((edge) => ({
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

function styleForType(type) {
  if (type === "root") {
    return {
      background: "linear-gradient(135deg, #0f172a, #1e293b)",
      color: "#fff",
      border: "1px solid #334155",
      borderRadius: 14,
      width: 240,
      padding: 12
    };
  }

  if (type === "world") {
    return {
      background: "linear-gradient(135deg, #164e63, #0f766e)",
      color: "#f0fdfa",
      border: "1px solid #0d9488",
      borderRadius: 12,
      width: 230,
      padding: 10
    };
  }

  return {
    background: "#f8fafc",
    color: "#0f172a",
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    width: 220,
    padding: 10
  };
}

export function summarizeNode(node) {
  return {
    title: node.title,
    tags: node.tags?.join(", ") || "",
    confidence: node.confidence
  };
}
