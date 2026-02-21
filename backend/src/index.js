import "dotenv/config";
import cors from "cors";
import crypto from "node:crypto";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ANTHROPIC_CONFIG, getModelForTask, MODEL_CONFIG } from "./config/models.js";

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
  res.json({
    ok: true,
    service: "eventsim-backend",
    now: new Date().toISOString(),
    anthropicConfigured: Boolean(ANTHROPIC_CONFIG.apiKey),
    models: MODEL_CONFIG
  });
});

app.post("/api/plan", async (req, res) => {
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
  const promptVersion = "v3";
  const key = hashText(JSON.stringify({ t: eventText, o: options, p: promptVersion }));
  const cacheFile = path.join(CACHE_DIR, `plan_${key}.json`);

  if (fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    return res.json({
      ...cached,
      meta: { ...cached.meta, cache: "hit" }
    });
  }

  try {
    const graph = ANTHROPIC_CONFIG.apiKey
      ? await buildInitialGraphWithClaude(eventText, options)
      : buildInitialGraphFallback(eventText, options);
    const payload = {
      graph,
      meta: {
        cache: "miss",
        provider: ANTHROPIC_CONFIG.apiKey ? "anthropic" : "fallback",
        eventHash,
        promptVersion,
        generatedAt: new Date().toISOString(),
        tokenEstimate: 640
      }
    };
    writeJson(cacheFile, payload);
    return res.json(payload);
  } catch (error) {
    console.error("[plan]", error);
    return res.status(500).json({ error: "plan_failed", message: "Failed to generate plan graph." });
  }
});

app.post("/api/expand", async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "local";
  if (isRateLimited(ip, 6_000, 8)) {
    return res.status(429).json({ error: "rate_limited", message: "Too many requests. Please wait a few seconds." });
  }

  const { eventHash, nodeId } = req.body || {};
  if (!eventHash || !nodeId) {
    return res.status(400).json({ error: "eventHash and nodeId are required" });
  }

  const promptVersion = "v3";
  const key = hashText(JSON.stringify({ eventHash, nodeId, promptVersion }));
  const cacheFile = path.join(CACHE_DIR, `expand_${key}.json`);

  if (fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    return res.json({ ...cached, meta: { ...cached.meta, cache: "hit" } });
  }

  try {
    const details = ANTHROPIC_CONFIG.apiKey
      ? await buildNodeDetailsWithClaude(nodeId)
      : buildNodeDetailsFallback(nodeId);
    const payload = {
      details,
      meta: {
        cache: "miss",
        provider: ANTHROPIC_CONFIG.apiKey ? "anthropic" : "fallback",
        eventHash,
        nodeId,
        promptVersion,
        generatedAt: new Date().toISOString(),
        tokenEstimate: 250
      }
    };
    writeJson(cacheFile, payload);
    return res.json(payload);
  } catch (error) {
    console.error("[expand]", error);
    return res.status(500).json({ error: "expand_failed", message: "Failed to expand node details." });
  }
});

app.post("/api/branch", async (req, res) => {
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

  const promptVersion = "v3";
  const key = hashText(JSON.stringify({ eventHash, parentNodeId, parentTitle, userQuestion, promptVersion }));
  const cacheFile = path.join(CACHE_DIR, `branch_${key}.json`);
  if (fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    return res.json({ ...cached, meta: { ...cached.meta, cache: "hit" } });
  }

  try {
    const parentLabel = parentTitle || parentNodeId;
    const children = ANTHROPIC_CONFIG.apiKey
      ? await buildBranchChildrenWithClaude(parentNodeId, parentLabel, userQuestion)
      : buildBranchChildrenFallback(parentNodeId, parentLabel, userQuestion);
    const payload = {
      nodes: children.nodes,
      edges: children.edges,
      meta: {
        cache: "miss",
        provider: ANTHROPIC_CONFIG.apiKey ? "anthropic" : "fallback",
        parentNodeId,
        generatedAt: new Date().toISOString(),
        tokenEstimate: 420
      }
    };
    writeJson(cacheFile, payload);
    return res.json(payload);
  } catch (error) {
    console.error("[branch]", error);
    return res.status(500).json({ error: "branch_failed", message: "Failed to generate child worlds." });
  }
});

app.post("/api/chat", async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "local";
  if (isRateLimited(ip, 4_000, 10)) {
    return res.status(429).json({ error: "rate_limited", message: "Too many chat requests. Slow down briefly." });
  }

  const { eventHash, nodeId, nodeTitle, roleId, message, history = [] } = req.body || {};
  if (!eventHash || !nodeId || !roleId || !message) {
    return res.status(400).json({ error: "eventHash, nodeId, roleId, message are required" });
  }
  const role = ROLE_PRESETS.find((r) => r.roleId === roleId);
  if (!role) {
    return res.status(400).json({ error: "invalid_role" });
  }
  if (isRestricted(message)) {
    return res.status(400).json({
      error: "restricted_content",
      message: "This assistant is for reflection only and cannot address this category."
    });
  }

  const promptVersion = "v3";
  const key = hashText(JSON.stringify({ eventHash, nodeId, roleId, message, history, promptVersion }));
  const cacheFile = path.join(CACHE_DIR, `chat_${key}.json`);
  if (fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    return res.json({ ...cached, meta: { ...cached.meta, cache: "hit" } });
  }

  try {
    const reply = ANTHROPIC_CONFIG.apiKey
      ? await buildRoleReplyWithClaude(role, nodeTitle || nodeId, message, history)
      : buildRoleReplyFallback(role, nodeTitle || nodeId, message);
    const payload = {
      reply,
      meta: {
        cache: "miss",
        provider: ANTHROPIC_CONFIG.apiKey ? "anthropic" : "fallback",
        roleId,
        nodeId,
        generatedAt: new Date().toISOString(),
        tokenEstimate: 180
      }
    };
    writeJson(cacheFile, payload);
    return res.json(payload);
  } catch (error) {
    console.error("[chat]", error);
    return res.status(500).json({ error: "chat_failed", message: "Failed to get chatbot reply." });
  }
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
  console.log(`[eventsim] anthropic configured: ${Boolean(ANTHROPIC_CONFIG.apiKey)}`);
  console.log(`[eventsim] models:`, MODEL_CONFIG);
});

async function buildInitialGraphWithClaude(eventText, options) {
  const timeframe = options.timeframe || "1 year";
  const stakes = options.stakes || "medium";
  const goal = options.goal || "growth";
  const rootTitle = shortTitle(eventText);
  const system = [
    "You are EventSim planner.",
    "Return JSON only with this shape:",
    '{"worlds":[{"suffix":"A","distance":"minimal|moderate|radical","title":"...","delta":"...","one_liner":"...","tags":["...","..."],"confidence":0.0}]}',
    "Exactly 3 worlds with suffix A/B/C in order.",
    "No markdown."
  ].join(" ");
  const user = `Event: ${eventText}\nTimeframe: ${timeframe}\nStakes: ${stakes}\nGoal: ${goal}`;
  const text = await callClaudeText({
    model: getModelForTask("basic"),
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 500
  });
  const parsed = safeJsonParse(text);
  if (!parsed?.worlds || !Array.isArray(parsed.worlds) || parsed.worlds.length !== 3) {
    return buildInitialGraphFallback(eventText, options);
  }

  const rootId = "root";
  const nodes = [
    {
      id: rootId,
      type: "root",
      title: rootTitle,
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
  const edges = [];

  for (const world of parsed.worlds.slice(0, 3)) {
    const suffix = String(world.suffix || "A").toLowerCase();
    const id = `world_${suffix}`;
    nodes.push({
      id,
      type: "world",
      title: limitWords(world.title || `World ${suffix.toUpperCase()}`, 5),
      delta: limitWords(world.delta || "Counterfactual change", 8),
      one_liner: limitWords(world.one_liner || "Alternative trajectory for this event.", 16),
      tags: Array.isArray(world.tags) ? world.tags.slice(0, 3) : [world.distance || "minimal", goal],
      confidence: clampNumber(world.confidence, 0.4, 0.95, 0.7),
      parentId: rootId,
      depth: 1,
      collapsed: false,
      data: { distance: world.distance || "minimal", branchLabel: suffix.toUpperCase() }
    });
    edges.push({ id: `e_${rootId}_${id}`, source: rootId, target: id, label: "counterfactual" });
  }

  return { nodes, edges };
}

async function buildNodeDetailsWithClaude(nodeId) {
  const system = [
    "You are EventSim details generator.",
    "Return JSON only with fields consequences(3 items), why_it_changes, next_question, risk_flags(max2).",
    "Keep concise and practical."
  ].join(" ");
  const text = await callClaudeText({
    model: getModelForTask("basic"),
    system,
    messages: [{ role: "user", content: `Node id: ${nodeId}` }],
    maxTokens: 260
  });
  const parsed = safeJsonParse(text);
  if (!parsed) return buildNodeDetailsFallback(nodeId);
  return {
    nodeId,
    consequences: normalizeStringArray(parsed.consequences, 3, [
      "Downstream priorities may reorder",
      "Execution constraints can change",
      "Second-order effects can appear quickly"
    ]),
    why_it_changes:
      typeof parsed.why_it_changes === "string"
        ? parsed.why_it_changes
        : "Assumption changes alter feasible actions and expected outcomes.",
    next_question:
      typeof parsed.next_question === "string"
        ? parsed.next_question
        : "What small test can validate this branch in the next 7 days?",
    risk_flags: normalizeStringArray(parsed.risk_flags, 2, ["tradeoff"])
  };
}

async function buildBranchChildrenWithClaude(parentNodeId, parentTitle, userQuestion) {
  const base = parentNodeId.startsWith("world_") ? parentNodeId : `world_${parentNodeId}`;
  const system = [
    "You are EventSim branching engine.",
    "Return JSON only:",
    '{"children":[{"index":1,"distance":"minimal|moderate|radical","title":"...","delta":"...","one_liner":"...","tags":["...","..."],"confidence":0.0}]}',
    "Exactly 3 children with index 1,2,3."
  ].join(" ");
  const user = `Parent: ${parentTitle}\nQuestion: ${userQuestion || ""}`;
  const text = await callClaudeText({
    model: getModelForTask("branch"),
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 420
  });
  const parsed = safeJsonParse(text);
  if (!parsed?.children || !Array.isArray(parsed.children) || parsed.children.length !== 3) {
    return buildBranchChildrenFallback(parentNodeId, parentTitle, userQuestion);
  }

  const nodes = [];
  const edges = [];
  for (const child of parsed.children.slice(0, 3)) {
    const idx = clampInt(child.index, 1, 3, 1);
    const id = `${base}${idx}`;
    const label = branchLabelFromNodeId(id);
    nodes.push({
      id,
      type: "world",
      title: limitWords(child.title || `World ${label}`, 5),
      delta: limitWords(child.delta || "Branch adjustment", 8),
      one_liner: limitWords(child.one_liner || "Follow-up branch derived from user question.", 16),
      tags: normalizeStringArray(child.tags, 3, [child.distance || "minimal", "branched"]),
      confidence: clampNumber(child.confidence, 0.4, 0.95, 0.68),
      parentId: parentNodeId,
      collapsed: false,
      data: {
        distance: typeof child.distance === "string" ? child.distance : "minimal",
        branchLabel: label,
        derivedFromQuestion: userQuestion || ""
      }
    });
    edges.push({
      id: `e_${parentNodeId}_${id}`,
      source: parentNodeId,
      target: id,
      label: "counterfactual"
    });
  }
  return { nodes, edges };
}

async function buildRoleReplyWithClaude(role, nodeTitle, message, history) {
  const system = [
    `You are ${role.title} and must respond in this style: ${role.style}.`,
    "Return JSON only:",
    '{"answer":"...","bullets":["...","...","..."],"nextQuestion":"..."}',
    "bullets must be exactly 3."
  ].join(" ");
  const historyLines = Array.isArray(history)
    ? history
        .slice(-6)
        .map((h) => `${h.sender || "user"}: ${h.text || ""}`)
        .join("\n")
    : "";
  const user = `Node: ${nodeTitle}\nHistory:\n${historyLines}\nUser: ${message}`;
  const text = await callClaudeText({
    model: getModelForTask("chatbot"),
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 260
  });
  const parsed = safeJsonParse(text);
  if (!parsed) return buildRoleReplyFallback(role, nodeTitle, message);
  return {
    roleId: role.roleId,
    roleTitle: role.title,
    answer:
      typeof parsed.answer === "string"
        ? parsed.answer
        : `From ${role.title} on ${nodeTitle}: focus on pragmatic tradeoffs.`,
    bullets: normalizeStringArray(parsed.bullets, 3, [
      "List key assumptions",
      "Choose one low-risk experiment",
      "Set a near-term review checkpoint"
    ]),
    nextQuestion:
      typeof parsed.nextQuestion === "string"
        ? parsed.nextQuestion
        : "What concrete next step can you validate in 48 hours?"
  };
}

async function callClaudeText({ model, system, messages, maxTokens }) {
  const response = await fetch(ANTHROPIC_CONFIG.apiUrl, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_CONFIG.apiKey,
      "anthropic-version": ANTHROPIC_CONFIG.version,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.2,
      system,
      messages
    })
  });
  if (!response.ok) {
    throw new Error(`Anthropic error ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  const text = data?.content?.find((item) => item.type === "text")?.text || "";
  return text.trim();
}

function buildInitialGraphFallback(eventText, options) {
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

function buildBranchChildrenFallback(parentNodeId, parentTitle, userQuestion) {
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

function buildNodeDetailsFallback(nodeId) {
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

function buildRoleReplyFallback(role, nodeTitle, message) {
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

function normalizeStringArray(value, maxLen, fallback) {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, maxLen);
}

function safeJsonParse(text) {
  if (!text) return null;
  const raw = text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function limitWords(text, maxWords) {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, maxWords);
  return words.join(" ");
}

function summarizeIntent(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const words = cleaned.split(" ").slice(0, 20).join(" ");
  return `Your question focus: ${words}.`;
}

function branchLabelFromNodeId(nodeId) {
  return nodeId.replace(/^world_/, "").toUpperCase();
}

function shortTitle(input) {
  const words = String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8);
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

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
