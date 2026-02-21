import cors from "cors";
import crypto from "node:crypto";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, "cache");
const DEMO_DIR = path.join(ROOT, "demo");

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const ROLE_PRESETS = [
  { roleId: "you_now", title: "You-Now", style: "practical and immediate constraints" },
  { roleId: "you_5y", title: "You-in-5-Years", style: "long-term compounding and regret minimization" },
  { roleId: "neutral_advisor", title: "Neutral Advisor", style: "balanced tradeoffs and risk framing" }
];

const RESTRICTED_PATTERNS = [
  /medical diagnosis/i,
  /legal advice/i,
  /self[-\s]?harm/i,
  /\bsuicide\b/i,
  /kill myself/i
];

const rateState = new Map();
ensureDir(CACHE_DIR);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "eventsim-backend", now: new Date().toISOString() });
});

app.post("/api/plan", (req, res) => {
  const { eventText, options = {} } = req.body || {};
  if (!eventText || typeof eventText !== "string") {
    return res.status(400).json({ error: "eventText is required" });
  }

  if (isRestricted(eventText)) {
    return res.status(400).json({
      error: "restricted_content",
      message:
        "EventSim is for reflection and exploration. It cannot help with medical, legal, or self-harm instruction requests."
    });
  }

  const eventHash = hashText(eventText.trim().toLowerCase());
  const promptVersion = "v2";
  const key = hashText(JSON.stringify({ t: eventText, o: options, p: promptVersion }));
  const cacheFile = path.join(CACHE_DIR, `plan_${key}.json`);

  if (fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    return res.json({
      ...cached,
      meta: { ...cached.meta, cache: "hit" }
    });
  }

  const graph = buildInitialGraph(eventText, options);
  const payload = {
    graph,
    meta: {
      cache: "miss",
      eventHash,
      promptVersion,
      generatedAt: new Date().toISOString(),
      tokenEstimate: 640
    }
  };

  writeJson(cacheFile, payload);
  res.json(payload);
});

app.post("/api/expand", (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "local";
  if (isRateLimited(ip, 6_000, 8)) {
    return res.status(429).json({ error: "rate_limited", message: "Too many requests. Please wait a few seconds." });
  }

  const { eventHash, nodeId } = req.body || {};
  if (!eventHash || !nodeId) {
    return res.status(400).json({ error: "eventHash and nodeId are required" });
  }

  const promptVersion = "v2";
  const key = hashText(JSON.stringify({ eventHash, nodeId, promptVersion }));
  const cacheFile = path.join(CACHE_DIR, `expand_${key}.json`);

  if (fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    return res.json({ ...cached, meta: { ...cached.meta, cache: "hit" } });
  }

  const details = buildNodeDetails(nodeId);
  const payload = {
    details,
    meta: {
      cache: "miss",
      eventHash,
      nodeId,
      promptVersion,
      generatedAt: new Date().toISOString(),
      tokenEstimate: 250
    }
  };

  writeJson(cacheFile, payload);
  res.json(payload);
});

app.post("/api/branch", (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "local";
  if (isRateLimited(ip, 6_000, 6)) {
    return res.status(429).json({ error: "rate_limited", message: "Too many requests. Please wait a few seconds." });
  }

  const { eventHash, parentNodeId, parentTitle, userQuestion } = req.body || {};
  if (!eventHash || !parentNodeId) {
    return res.status(400).json({ error: "eventHash and parentNodeId are required" });
  }
  if (isRestricted(userQuestion || "")) {
    return res.status(400).json({ error: "restricted_content", message: "This query category is not supported." });
  }

  const promptVersion = "v2";
  const key = hashText(JSON.stringify({ eventHash, parentNodeId, parentTitle, userQuestion, promptVersion }));
  const cacheFile = path.join(CACHE_DIR, `branch_${key}.json`);
  if (fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    return res.json({ ...cached, meta: { ...cached.meta, cache: "hit" } });
  }

  const parentLabel = parentTitle || parentNodeId;
  const children = buildBranchChildren(parentNodeId, parentLabel, userQuestion);
  const payload = {
    nodes: children.nodes,
    edges: children.edges,
    meta: {
      cache: "miss",
      parentNodeId,
      generatedAt: new Date().toISOString(),
      tokenEstimate: 420
    }
  };
  writeJson(cacheFile, payload);
  res.json(payload);
});

app.post("/api/chat", (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "local";
  if (isRateLimited(ip, 4_000, 10)) {
    return res.status(429).json({ error: "rate_limited", message: "Too many chat requests. Slow down briefly." });
  }

  const { eventHash, nodeId, nodeTitle, roleId, message, history = [] } = req.body || {};
  if (!eventHash || !nodeId || !roleId || !message) {
    return res.status(400).json({ error: "eventHash, nodeId, roleId, message are required" });
  }
  if (!ROLE_PRESETS.some((r) => r.roleId === roleId)) {
    return res.status(400).json({ error: "invalid_role" });
  }
  if (isRestricted(message)) {
    return res.status(400).json({
      error: "restricted_content",
      message: "This assistant is for reflection only and cannot address this category."
    });
  }

  const promptVersion = "v2";
  const key = hashText(JSON.stringify({ eventHash, nodeId, roleId, message, history, promptVersion }));
  const cacheFile = path.join(CACHE_DIR, `chat_${key}.json`);
  if (fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    return res.json({ ...cached, meta: { ...cached.meta, cache: "hit" } });
  }

  const role = ROLE_PRESETS.find((r) => r.roleId === roleId);
  const reply = buildRoleReply(role, nodeTitle || nodeId, message);
  const payload = {
    reply,
    meta: {
      cache: "miss",
      roleId,
      nodeId,
      generatedAt: new Date().toISOString(),
      tokenEstimate: 180
    }
  };
  writeJson(cacheFile, payload);
  res.json(payload);
});

app.get("/api/demo/:id", (req, res) => {
  const id = req.params.id;
  const demoFile = path.join(DEMO_DIR, `${id}.json`);
  if (!fs.existsSync(demoFile)) {
    return res.status(404).json({ error: "not_found", message: `No demo scenario '${id}'` });
  }

  const demo = readJson(demoFile);
  res.json(demo);
});

app.listen(PORT, () => {
  console.log(`[eventsim] backend listening on http://localhost:${PORT}`);
});

function buildInitialGraph(eventText, options) {
  const timeframe = options.timeframe || "1 year";
  const stakes = options.stakes || "medium";
  const goal = options.goal || "growth";
  const rootId = "root";

  const nodes = [
    {
      id: rootId,
      type: "root",
      title: shortTitle(eventText),
      delta: "Baseline event",
      one_liner: "Starting point before counterfactual changes.",
      tags: [stakes, goal],
      confidence: 0.76,
      parentId: null,
      depth: 0,
      collapsed: false,
      data: { timeframe, stakes, goal, eventText }
    }
  ];

  const seedWorlds = [
    ["a", "minimal", "Small adjustment, most assumptions remain intact.", "Change one controllable factor", 0.74],
    ["b", "moderate", "A meaningful pivot with moderate disruption.", "Change decision and one constraint", 0.68],
    ["c", "radical", "High-variance move with a different strategic frame.", "Shift environment and goals", 0.59]
  ];

  const edges = [];
  for (const [suffix, distance, oneLiner, delta, confidence] of seedWorlds) {
    const id = `world_${suffix}`;
    nodes.push({
      id,
      type: "world",
      title: `World ${suffix.toUpperCase()}`,
      delta,
      one_liner: oneLiner,
      tags: [distance, goal],
      confidence,
      parentId: rootId,
      depth: 1,
      collapsed: false,
      data: { distance, branchLabel: suffix.toUpperCase() }
    });
    edges.push({ id: `e_${rootId}_${id}`, source: rootId, target: id, label: "counterfactual" });
  }

  return { nodes, edges };
}

function buildBranchChildren(parentNodeId, parentTitle, userQuestion) {
  const children = [];
  const edges = [];
  const base = parentNodeId.startsWith("world_") ? parentNodeId : `world_${parentNodeId}`;
  const questionHint = shortTitle(userQuestion || "user follow-up");

  const variants = [
    { s: "1", distance: "minimal", delta: "Refine one variable", confidence: 0.72 },
    { s: "2", distance: "moderate", delta: "Adjust decision and constraints", confidence: 0.66 },
    { s: "3", distance: "radical", delta: "Reframe goals and environment", confidence: 0.58 }
  ];

  for (const variant of variants) {
    const id = `${base}${variant.s}`;
    const label = branchLabelFromNodeId(id);
    children.push({
      id,
      type: "world",
      title: `World ${label}`,
      delta: variant.delta,
      one_liner: `${parentTitle} -> ${variant.distance} follow-up via ${questionHint}.`,
      tags: [variant.distance, "branched"],
      confidence: variant.confidence,
      parentId: parentNodeId,
      collapsed: false,
      data: { distance: variant.distance, branchLabel: label, derivedFromQuestion: userQuestion || "" }
    });
    edges.push({
      id: `e_${parentNodeId}_${id}`,
      source: parentNodeId,
      target: id,
      label: "counterfactual"
    });
  }

  return { nodes: children, edges };
}

function buildNodeDetails(nodeId) {
  if (nodeId === "root") {
    return {
      nodeId,
      consequences: [
        "Baseline assumptions are kept fixed",
        "Use child worlds for what-if analysis",
        "Compare branches before committing"
      ],
      why_it_changes: "The root is only the anchor context. Branches carry actionable divergences.",
      next_question: "Which first-level world seems most plausible to explore deeper?",
      risk_flags: ["uncertainty"]
    };
  }

  return {
    nodeId,
    consequences: [
      "Downstream priorities may reorder",
      "Execution constraints can change",
      "Second-order effects can appear quickly"
    ],
    why_it_changes:
      "This world modifies assumptions and therefore shifts feasible actions, risks, and expected outcomes.",
    next_question: "What small test can validate this branch in the next 7 days?",
    risk_flags: ["tradeoff", "uncertainty"]
  };
}

function buildRoleReply(role, nodeTitle, message) {
  const intent = summarizeIntent(message);
  if (role.roleId === "you_now") {
    return {
      roleId: role.roleId,
      roleTitle: role.title,
      answer: `From You-Now on ${nodeTitle}: prioritize immediate feasibility. ${intent}`,
      bullets: [
        "Identify one immediate blocker",
        "Choose the lowest-friction next action",
        "Set a 48-hour checkpoint"
      ],
      nextQuestion: "What concrete step can you finish by tomorrow?"
    };
  }

  if (role.roleId === "you_5y") {
    return {
      roleId: role.roleId,
      roleTitle: role.title,
      answer: `From You-in-5-Years on ${nodeTitle}: optimize for compounding, not comfort. ${intent}`,
      bullets: [
        "Protect long-term option value",
        "Prefer skill-building over short-term optics",
        "Evaluate regret if repeated for 12 months"
      ],
      nextQuestion: "Which option compounds your learning and network the fastest?"
    };
  }

  return {
    roleId: role.roleId,
    roleTitle: role.title,
    answer: `Neutral Advisor for ${nodeTitle}: balance upside, downside, and reversibility. ${intent}`,
    bullets: [
      "List assumptions explicitly",
      "Compare downside asymmetry",
      "Pick a reversible experiment first"
    ],
    nextQuestion: "Which option remains robust across multiple future branches?"
  };
}

function summarizeIntent(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const words = cleaned.split(" ").slice(0, 20).join(" ");
  return `Your question focus: ${words}.`;
}

function branchLabelFromNodeId(nodeId) {
  return nodeId.replace(/^world_/, "").toUpperCase();
}

function shortTitle(input) {
  const words = input.replace(/\s+/g, " ").trim().split(" ").slice(0, 8);
  return words.join(" ");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function hashText(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function isRestricted(text) {
  return RESTRICTED_PATTERNS.some((p) => p.test(text || ""));
}

function isRateLimited(key, windowMs, maxRequests) {
  const now = Date.now();
  const queue = rateState.get(key) || [];
  const fresh = queue.filter((t) => now - t < windowMs);
  if (fresh.length >= maxRequests) return true;
  fresh.push(now);
  rateState.set(key, fresh);
  return false;
}
