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
  const { eventText, options = {}, useCache = true } = req.body || {};
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
  const promptVersion = "v6";
  const key = hashText(JSON.stringify({ t: eventText, o: options, p: promptVersion }));
  const cacheFile = path.join(CACHE_DIR, `plan_${key}.json`);
  if (useCache && fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    return res.json({ ...cached, meta: { ...cached.meta, cache: "hit", cacheEnabled: true } });
  }

  const generated = await withProviderFallback(
    () => buildInitialGraphWithClaude(eventText, options),
    () => buildInitialGraphFallback(eventText, options),
    "plan"
  );
  const payload = {
    graph: {
      nodes: generated.data?.nodes || [],
      edges: generated.data?.edges || []
    },
    meta: {
      cache: "miss",
      cacheEnabled: Boolean(useCache),
      provider: generated.provider,
      fallbackReason: generated.fallbackReason,
      contentFallback: Boolean(generated.data?.__contentFallback),
      contentFallbackReason: generated.data?.__contentFallbackReason || null,
      eventHash,
      promptVersion,
      generatedAt: new Date().toISOString(),
      tokenEstimate: 640
    }
  };
  if (useCache) writeJson(cacheFile, payload);
  if (!useCache) payload.meta.cache = "bypass";
  return res.json(payload);
});

app.post("/api/expand", async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "local";
  if (isRateLimited(ip, 6_000, 8)) {
    return res.status(429).json({ error: "rate_limited", message: "Too many requests. Please wait a few seconds." });
  }
  const {
    eventHash,
    nodeId,
    nodeTitle,
    nodeType,
    nodeOneLiner,
    nodeDelta,
    nodeTags = [],
    parentId,
    lineage = [],
    useCache = true
  } = req.body || {};
  if (!eventHash || !nodeId) return res.status(400).json({ error: "eventHash and nodeId are required" });

  const promptVersion = "v8";
  const key = hashText(
    JSON.stringify({
      eventHash,
      nodeId,
      nodeTitle,
      nodeType,
      nodeOneLiner,
      nodeDelta,
      nodeTags,
      parentId,
      lineage,
      promptVersion
    })
  );
  const cacheFile = path.join(CACHE_DIR, `expand_${key}.json`);
  if (useCache && fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    return res.json({ ...cached, meta: { ...cached.meta, cache: "hit", cacheEnabled: true } });
  }

  const nodeContext = {
    title: nodeTitle || "",
    type: nodeType || "",
    oneLiner: nodeOneLiner || "",
    delta: nodeDelta || "",
    tags: Array.isArray(nodeTags) ? nodeTags : [],
    parentId: parentId || null,
    lineage: Array.isArray(lineage) ? lineage : []
  };
  const generated = await withProviderFallback(
    () => buildNodeDetailsWithClaude(nodeId, nodeContext),
    () => buildNodeDetailsFallback(nodeId, nodeContext),
    "expand"
  );
  const { __contentFallback, __contentFallbackReason, ...detailsBody } = generated.data || {};
  const payload = {
    details: detailsBody,
    meta: {
      cache: "miss",
      cacheEnabled: Boolean(useCache),
      provider: generated.provider,
      fallbackReason: generated.fallbackReason,
      contentFallback: Boolean(__contentFallback),
      contentFallbackReason: __contentFallbackReason || null,
      eventHash,
      nodeId,
      promptVersion,
      generatedAt: new Date().toISOString(),
      tokenEstimate: 250
    }
  };
  if (useCache) writeJson(cacheFile, payload);
  if (!useCache) payload.meta.cache = "bypass";
  return res.json(payload);
});

app.post("/api/branch", async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "local";
  if (isRateLimited(ip, 6_000, 6)) {
    return res.status(429).json({ error: "rate_limited", message: "Too many requests. Please wait a few seconds." });
  }
  const {
    eventHash,
    parentNodeId,
    parentTitle,
    parentBranchLabel,
    parentOneLiner,
    parentDelta,
    parentTags = [],
    userQuestion,
    lineage = [],
    useCache = true
  } = req.body || {};
  if (!eventHash || !parentNodeId) return res.status(400).json({ error: "eventHash and parentNodeId are required" });
  if (isRestricted(userQuestion || "")) {
    return res.status(400).json({ error: "restricted_content", message: "This query category is not supported." });
  }

  const promptVersion = "v6";
  const key = hashText(
    JSON.stringify({
      eventHash,
      parentNodeId,
      parentTitle,
      parentBranchLabel,
      parentOneLiner,
      parentDelta,
      parentTags,
      userQuestion,
      lineage,
      promptVersion
    })
  );
  const cacheFile = path.join(CACHE_DIR, `branch_${key}.json`);
  if (useCache && fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    return res.json({ ...cached, meta: { ...cached.meta, cache: "hit", cacheEnabled: true } });
  }

  const parentLabel = parentTitle || parentNodeId;
  const parentContext = {
    oneLiner: parentOneLiner || "",
    delta: parentDelta || "",
    tags: Array.isArray(parentTags) ? parentTags : []
  };
  const generated = await withProviderFallback(
    () => buildBranchChildrenWithClaude(parentNodeId, parentLabel, parentBranchLabel, userQuestion, lineage, parentContext),
    () => buildBranchChildrenFallback(parentNodeId, parentLabel, parentBranchLabel, userQuestion, lineage, parentContext),
    "branch"
  );
  const payload = {
    nodes: generated.data.nodes,
    edges: generated.data.edges,
    meta: {
      cache: "miss",
      cacheEnabled: Boolean(useCache),
      provider: generated.provider,
      fallbackReason: generated.fallbackReason,
      contentFallback: Boolean(generated.data?.__contentFallback),
      contentFallbackReason: generated.data?.__contentFallbackReason || null,
      parentNodeId,
      generatedAt: new Date().toISOString(),
      tokenEstimate: 420
    }
  };
  if (useCache) writeJson(cacheFile, payload);
  if (!useCache) payload.meta.cache = "bypass";
  return res.json(payload);
});

app.post("/api/chat", async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "local";
  if (isRateLimited(ip, 4_000, 10)) {
    return res.status(429).json({ error: "rate_limited", message: "Too many chat requests. Slow down briefly." });
  }
  const { eventHash, nodeId, nodeTitle, roleId, message, history = [], useCache = true } = req.body || {};
  if (!eventHash || !nodeId || !roleId || !message) {
    return res.status(400).json({ error: "eventHash, nodeId, roleId, message are required" });
  }
  const role = ROLE_PRESETS.find((r) => r.roleId === roleId);
  if (!role) return res.status(400).json({ error: "invalid_role" });
  if (isRestricted(message)) {
    return res.status(400).json({
      error: "restricted_content",
      message: "This assistant is for reflection only and cannot address this category."
    });
  }

  const promptVersion = "v7";
  const key = hashText(JSON.stringify({ eventHash, nodeId, roleId, message, history, promptVersion }));
  const cacheFile = path.join(CACHE_DIR, `chat_${key}.json`);
  if (useCache && fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    return res.json({ ...cached, meta: { ...cached.meta, cache: "hit", cacheEnabled: true } });
  }

  const generated = await withProviderFallback(
    () => buildRoleReplyWithClaude(role, nodeTitle || nodeId, message, history),
    () => buildRoleReplyFallback(role, nodeTitle || nodeId, message, history),
    "chat"
  );
  const { __contentFallback, __contentFallbackReason, ...replyBody } = generated.data || {};
  const payload = {
    reply: replyBody,
    meta: {
      cache: "miss",
      cacheEnabled: Boolean(useCache),
      provider: generated.provider,
      fallbackReason: generated.fallbackReason,
      contentFallback: Boolean(__contentFallback),
      contentFallbackReason: __contentFallbackReason || null,
      roleId,
      nodeId,
      generatedAt: new Date().toISOString(),
      tokenEstimate: 180
    }
  };
  if (useCache) writeJson(cacheFile, payload);
  if (!useCache) payload.meta.cache = "bypass";
  return res.json(payload);
});

app.get("/api/demo/:id", (req, res) => {
  const demoFile = path.join(DEMO_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(demoFile)) return res.status(404).json({ error: "not_found" });
  return res.json(readJson(demoFile));
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
  const system = [
    "You are EventSim planner.",
    "Return JSON only:",
    '{"worlds":[{"suffix":"A","distance":"minimal|moderate|radical","title":"...","delta":"...","one_liner":"...","tags":["..."],"confidence":0.0}]}',
    "Exactly 3 worlds with suffix A/B/C."
  ].join(" ");
  const text = await callClaudeText({
    model: getModelForTask("basic"),
    system,
    messages: [{ role: "user", content: `Event:${eventText}\nTimeframe:${timeframe}\nStakes:${stakes}\nGoal:${goal}` }],
    maxTokens: 500
  });
  let parsed = safeJsonParse(text);
  let worlds = normalizePlanWorlds(parsed);
  if (!worlds) {
    const retryText = await callClaudeText({
      model: getModelForTask("basic"),
      system: [
        "You are EventSim planner.",
        "Output must be valid minified JSON only.",
        "No markdown, no prose, no code fences.",
        "Required schema:",
        '{"worlds":[{"suffix":"A","distance":"minimal|moderate|radical","title":"...","delta":"...","one_liner":"...","tags":["..."],"confidence":0.0}]}',
        "Exactly 3 items."
      ].join(" "),
      messages: [{ role: "user", content: `Event:${eventText}\nTimeframe:${timeframe}\nStakes:${stakes}\nGoal:${goal}` }],
      maxTokens: 420
    });
    parsed = safeJsonParse(retryText);
    worlds = normalizePlanWorlds(parsed);
  }
  if (!worlds) {
    console.warn("[plan] content fallback: invalid JSON schema from provider");
    return markContentFallback(buildInitialGraphFallback(eventText, options), "invalid_plan_json_schema");
  }

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
  const edges = [];
  for (const world of worlds) {
    const suffix = String(world.suffix || "A").toLowerCase();
    const id = `world_${suffix}`;
    nodes.push({
      id,
      type: "world",
      title: limitWords(world.title || `World ${suffix.toUpperCase()}`, 5),
      delta: limitWords(world.delta || "Counterfactual change", 8),
      one_liner: limitWords(world.one_liner || "Alternative trajectory.", 16),
      tags: normalizeStringArray(world.tags, 3, [world.distance || "minimal", goal]),
      confidence: clampNumber(world.confidence, 0.4, 0.95, 0.7),
      parentId: rootId,
      depth: 1,
      collapsed: false,
      data: { distance: world.distance || "minimal", branchLabel: suffix.toUpperCase() }
    });
    edges.push({ id: `e_${rootId}_${id}`, source: rootId, target: id, label: "counterfactual" });
  }
  return { nodes, edges, __contentFallback: false, __contentFallbackReason: null };
}

async function buildNodeDetailsWithClaude(nodeId, nodeContext = {}) {
  const tagText = Array.isArray(nodeContext.tags) ? nodeContext.tags.join(", ") : "";
  const lineageText = lineageToText(nodeContext.lineage || []);
  const text = await callClaudeText({
    model: getModelForTask("basic"),
    system: [
      "You are EventSim node analyst.",
      "Use node context to produce specific, non-generic analysis.",
      "Do not mention lack of context if context is provided.",
      "Return JSON only with consequences(3), why_it_changes, next_question, risk_flags(max2). Keep concise."
    ].join(" "),
    messages: [
      {
        role: "user",
        content: `NodeId:${nodeId}\nNodeTitle:${nodeContext.title || ""}\nNodeType:${nodeContext.type || ""}\nOneLiner:${nodeContext.oneLiner || ""}\nDelta:${nodeContext.delta || ""}\nTags:${tagText}\nParentId:${nodeContext.parentId || ""}\nLineage:${lineageText}`
      }
    ],
    maxTokens: 260
  });
  const parsed = safeJsonParse(text);
  if (!parsed || isGenericNodeDetails(parsed, nodeId, nodeContext)) {
    console.warn("[expand] content fallback: invalid or generic node details from provider", { nodeId });
    return markContentFallback(buildNodeDetailsFallback(nodeId, nodeContext), "invalid_expand_details");
  }
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
    risk_flags: normalizeStringArray(parsed.risk_flags, 2, ["tradeoff"]),
    __contentFallback: false,
    __contentFallbackReason: null
  };
}

async function buildBranchChildrenWithClaude(
  parentNodeId,
  parentTitle,
  parentBranchLabel,
  userQuestion,
  lineage = [],
  parentContext = {}
) {
  const base = buildBranchBase(parentNodeId, userQuestion, lineage);
  const lineageText = lineageToText(lineage);
  const shortLineage = lineageToText(lineage.slice(-3));
  const baseLabel = normalizeBranchLabel(parentBranchLabel || extractTailLabel(parentNodeId));
  const contextTags = Array.isArray(parentContext.tags) ? parentContext.tags.join(", ") : "";
  const text = await callClaudeText({
    model: getModelForTask("branch"),
    system: [
      "You are EventSim branching engine.",
      "Return JSON only:",
      '{"children":[{"index":1,"distance":"minimal|moderate|radical","title":"...","delta":"...","one_liner":"...","tags":["..."],"confidence":0.0}]}',
      "Exactly 3 children with index 1/2/3.",
      "Use both lineage and question.",
      "Children must be grounded in parent context and evolve from parent assumptions.",
      "Keep each one_liner under 16 words."
    ].join(" "),
    messages: [
      {
        role: "user",
        content: `Parent:${parentTitle}\nParentLabel:${baseLabel}\nParentDelta:${parentContext.delta || ""}\nParentOneLiner:${parentContext.oneLiner || ""}\nParentTags:${contextTags}\nLineage:${shortLineage}\nQuestion:${userQuestion || ""}`
      }
    ],
    maxTokens: 420
  });
  const parsed = safeJsonParse(text);
  const normalizedChildren = normalizeBranchChildren(parsed);
  if (!normalizedChildren) {
    console.warn("[branch] content fallback: invalid JSON schema from provider");
    return markContentFallback(
      buildBranchChildrenFallback(parentNodeId, parentTitle, parentBranchLabel, userQuestion, lineage, parentContext),
      "invalid_branch_json_schema"
    );
  }

  const nodes = [];
  const edges = [];
  for (const child of normalizedChildren) {
    const idx = clampInt(child.index, 1, 3, 1);
    const id = `${base}_${idx}`;
    const childLabel = `${baseLabel}${idx}`;
    nodes.push({
      id,
      type: "world",
      title: cleanGeneratedTitle(child.title, parentTitle, userQuestion, childLabel),
      delta: limitWords(child.delta || "Branch adjustment", 8),
      one_liner: cleanOneLiner(
        child.one_liner || `${parentTitle} branch under ${userQuestion || "a new question"}`,
        parentTitle,
        userQuestion,
        parentContext
      ),
      tags: normalizeStringArray(child.tags, 3, [child.distance || "minimal", "branched"]),
      confidence: clampNumber(child.confidence, 0.4, 0.95, 0.68),
      parentId: parentNodeId,
      collapsed: false,
      data: {
        distance: typeof child.distance === "string" ? child.distance : "minimal",
        branchLabel: childLabel,
        derivedFromQuestion: userQuestion || "",
        lineageContext: lineageText
      }
    });
    edges.push({ id: `e_${parentNodeId}_${id}`, source: parentNodeId, target: id, label: "counterfactual" });
  }
  return { nodes, edges, __contentFallback: false, __contentFallbackReason: null };
}

async function buildRoleReplyWithClaude(role, nodeTitle, message, history) {
  const historyLines = Array.isArray(history)
    ? history
        .slice(-8)
        .map(compactHistoryTurn)
        .filter(Boolean)
        .join("\n")
    : "";
  const text = await callClaudeText({
    model: getModelForTask("chatbot"),
    system: [
      `You are ${role.title}. Style: ${role.style}.`,
      "Build on latest user message and avoid repeating prior bullets verbatim.",
      "Return JSON only:",
      '{"answer":"...","bullets":["...","...","..."],"nextQuestion":"..."}'
    ].join(" "),
    messages: [{ role: "user", content: `Node:${nodeTitle}\nHistory:\n${historyLines}\nUser:${message}` }],
    maxTokens: 260
  });
  let parsed = safeJsonParse(text);
  if (!parsed) {
    const retryText = await callClaudeText({
      model: getModelForTask("chatbot"),
      system: [
        `You are ${role.title}. Style: ${role.style}.`,
        "Output must be valid minified JSON only.",
        "No markdown, no code fences, no prose.",
        '{"answer":"...","bullets":["...","...","..."],"nextQuestion":"..."}'
      ].join(" "),
      messages: [{ role: "user", content: `Node:${nodeTitle}\nUser:${message}` }],
      maxTokens: 220
    });
    parsed = safeJsonParse(retryText);
  }
  if (!parsed) {
    const fromText = parseRoleReplyText(text, role, nodeTitle);
    if (fromText) {
      return { ...fromText, __contentFallback: false, __contentFallbackReason: null };
    }
    console.warn("[chat] content fallback: invalid JSON from provider", { nodeTitle: shortTitle(nodeTitle), roleId: role.roleId });
    return markContentFallback(buildRoleReplyFallback(role, nodeTitle, message, history), "invalid_chat_json");
  }
  return {
    roleId: role.roleId,
    roleTitle: role.title,
    answer: typeof parsed.answer === "string" ? parsed.answer : `From ${role.title}: focus on tradeoffs.`,
    bullets: normalizeStringArray(parsed.bullets, 3, [
      "List assumptions",
      "Choose one low-risk test",
      "Set review checkpoint"
    ]),
    nextQuestion:
      typeof parsed.nextQuestion === "string"
        ? parsed.nextQuestion
        : "What concrete next step can you validate in 48 hours?",
    __contentFallback: false,
    __contentFallbackReason: null
  };
}

async function callClaudeText({ model, system, messages, maxTokens }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let response;
  try {
    response = await fetch(ANTHROPIC_CONFIG.apiUrl, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_CONFIG.apiKey,
        "anthropic-version": ANTHROPIC_CONFIG.version,
        "content-type": "application/json"
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.2, system, messages }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`Anthropic error ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  return (data?.content?.find((item) => item.type === "text")?.text || "").trim();
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
  const edges = [];
  const seedWorlds = [
    ["a", "minimal", "Small adjustment, most assumptions remain intact.", "Change one controllable factor", 0.74],
    ["b", "moderate", "A meaningful pivot with moderate disruption.", "Change decision and one constraint", 0.68],
    ["c", "radical", "High-variance move with a different strategic frame.", "Shift environment and goals", 0.59]
  ];
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

function buildBranchChildrenFallback(parentNodeId, parentTitle, parentBranchLabel, userQuestion, lineage = [], parentContext = {}) {
  const children = [];
  const edges = [];
  const base = buildBranchBase(parentNodeId, userQuestion, lineage);
  const questionHint = shortTitle(userQuestion || "follow-up");
  const baseLabel = normalizeBranchLabel(parentBranchLabel || extractTailLabel(parentNodeId));
  const lineageHint = shortTitle(lineageToText(lineage.slice(-3)));
  const parentAnchor = shortTitle(parentContext.oneLiner || parentContext.delta || parentTitle);
  const variants = [
    { s: "1", distance: "minimal", delta: "Refine one constraint", confidence: 0.72, line: "Validate the smallest executable step first to reduce trial cost." },
    { s: "2", distance: "moderate", delta: "Adjust strategy and pace", confidence: 0.66, line: "Keep direction, but rebalance resources and execution tempo." },
    { s: "3", distance: "radical", delta: "Reframe the stage goal", confidence: 0.58, line: "Allow goal reframing to unlock a higher-upside path." }
  ];
  for (const variant of variants) {
    const id = `${base}_${variant.s}`;
    const childLabel = `${baseLabel}${variant.s}`;
    children.push({
      id,
      type: "world",
      title: fallbackBranchTitle(parentTitle, questionHint, childLabel, variant.distance),
      delta: variant.delta,
      one_liner: `${variant.line} Inherited anchor: ${parentAnchor} (question: ${questionHint})`,
      tags: [variant.distance, "branched"],
      confidence: variant.confidence,
      parentId: parentNodeId,
      collapsed: false,
      data: {
        distance: variant.distance,
        branchLabel: childLabel,
        derivedFromQuestion: userQuestion || "",
        lineageContext: lineageHint
      }
    });
    edges.push({ id: `e_${parentNodeId}_${id}`, source: parentNodeId, target: id, label: "counterfactual" });
  }
  return { nodes: children, edges };
}

function buildNodeDetailsFallback(nodeId, nodeContext = {}) {
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
      risk_flags: ["uncertainty"],
      __contentFallback: true,
      __contentFallbackReason: "fallback_root"
    };
  }
  const title = shortTitle(nodeContext.title || nodeId);
  const oneLiner = String(nodeContext.oneLiner || "").trim();
  const delta = String(nodeContext.delta || "").trim();
  const tags = Array.isArray(nodeContext.tags) ? nodeContext.tags.filter(Boolean) : [];
  const tagFocus = tags.slice(0, 2).join(" + ");
  return {
    nodeId,
    consequences: [
      `${title} shifts priorities and resource allocation in the near term.`,
      oneLiner ? `Execution follows this direction: ${limitWords(oneLiner, 14)}.` : "Execution constraints can change quickly.",
      tagFocus ? `This path emphasizes ${tagFocus}, creating tradeoffs with alternatives.` : "Second-order effects can appear quickly."
    ],
    why_it_changes:
      delta || "This node modifies assumptions and therefore shifts feasible actions, risks, and expected outcomes.",
    next_question: "What concrete 7-day test can validate this node's key assumption?",
    risk_flags: ["tradeoff", "uncertainty"],
    __contentFallback: true,
    __contentFallbackReason: "fallback_node"
  };
}

function buildRoleReplyFallback(role, nodeTitle, message, history = []) {
  const intent = summarizeIntent(message);
  const userTurnCount = Array.isArray(history) ? history.filter((h) => h.sender === "user").length : 0;
  if (role.roleId === "you_now") {
    return {
      roleId: role.roleId,
      roleTitle: role.title,
      answer: `From You-Now on ${nodeTitle}: prioritize immediate feasibility. ${intent}`,
      bullets: ["Identify one immediate blocker", "Choose lowest-friction next action", "Set 48-hour checkpoint"],
      nextQuestion: "What concrete step can you finish by tomorrow?"
    };
  }
  if (role.roleId === "you_5y") {
    const variant = userTurnCount % 3;
    const bulletsByVariant = [
      ["Preserve reversibility for future moves", "Invest in compounding capability", "Estimate one-year regret before committing"],
      ["Expand options, avoid narrow lock-in", "Prefer learning velocity over short-term optics", "Test choices against a 12-month horizon"],
      ["Protect downside while keeping upside alive", "Build scarce skills that compound", "Ask what future-you would regret not trying"]
    ];
    return {
      roleId: role.roleId,
      roleTitle: role.title,
      answer: `From You-in-5-Years on ${nodeTitle}: optimize for compounding, not comfort. ${intent}`,
      bullets: bulletsByVariant[variant],
      nextQuestion: "Which option compounds learning and network fastest?"
    };
  }
  return {
    roleId: role.roleId,
    roleTitle: role.title,
    answer: `Neutral Advisor for ${nodeTitle}: balance upside, downside, and reversibility. ${intent}`,
    bullets: ["List assumptions explicitly", "Compare downside asymmetry", "Pick reversible experiment first"],
    nextQuestion: "Which option remains robust across multiple branches?"
  };
}

async function withProviderFallback(tryPrimary, fallbackFn, label) {
  if (!ANTHROPIC_CONFIG.apiKey) {
    return { data: fallbackFn(), provider: "fallback", fallbackReason: "missing_api_key" };
  }
  try {
    return { data: await tryPrimary(), provider: "anthropic", fallbackReason: null };
  } catch (error) {
    console.error(`[${label}] primary provider failed, fallback enabled`, error);
    return { data: fallbackFn(), provider: "fallback", fallbackReason: "provider_error" };
  }
}

function safeJsonParse(text) {
  if (!text) return null;
  const raw = text.trim();
  const sanitized = sanitizeJsonLike(raw);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(sanitizeJsonLike(fenced[1].trim()));
    } catch {}
  }
  try {
    return JSON.parse(sanitized);
  } catch {
    const candidate = extractFirstBalancedJsonObject(sanitized);
    if (!candidate) return null;
    try {
      return JSON.parse(candidate);
    } catch {}
    const repaired = repairTrailingCommas(candidate);
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

function normalizeStringArray(value, maxLen, fallback) {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, maxLen);
}

function limitWords(text, maxWords) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ");
}

function summarizeIntent(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return `Your question focus: ${cleaned.split(" ").slice(0, 20).join(" ")}.`;
}

function compactHistoryTurn(item) {
  const sender = item?.sender === "assistant" ? "assistant" : "user";
  const raw = String(item?.text || "").trim();
  if (!raw) return "";
  const firstChunk = raw.split("\nQ:")[0].split("\n- ")[0];
  const compact = firstChunk.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return `${sender}: ${limitWords(compact, 20)}`;
}

function markContentFallback(data, reason) {
  return { ...(data || {}), __contentFallback: true, __contentFallbackReason: reason || "content_fallback" };
}

function normalizePlanWorlds(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  let worlds = null;
  if (Array.isArray(parsed.worlds)) {
    worlds = parsed.worlds;
  } else if (parsed.worlds && typeof parsed.worlds === "object") {
    worlds = Object.values(parsed.worlds);
  } else if (Array.isArray(parsed.branches)) {
    worlds = parsed.branches;
  } else if (Array.isArray(parsed.children)) {
    worlds = parsed.children;
  }
  if (!Array.isArray(worlds) || worlds.length === 0) return null;
  const suffixes = ["A", "B", "C"];
  const normalized = worlds
    .slice(0, 3)
    .map((world, idx) => ({
      ...(world || {}),
      suffix: suffixes[idx],
      distance: normalizeDistance(world?.distance)
    }));
  return normalized.length === 3 ? normalized : null;
}

function normalizeBranchChildren(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  let children = null;
  if (Array.isArray(parsed.children)) {
    children = parsed.children;
  } else if (parsed.children && typeof parsed.children === "object") {
    children = Object.values(parsed.children);
  } else if (Array.isArray(parsed.branches)) {
    children = parsed.branches;
  } else if (Array.isArray(parsed.worlds)) {
    children = parsed.worlds;
  }
  if (!Array.isArray(children) || children.length === 0) return null;
  const normalized = children.slice(0, 3).map((child, idx) => ({
    ...(child || {}),
    index: clampInt(child?.index, 1, 3, idx + 1),
    distance: normalizeDistance(child?.distance)
  }));
  if (normalized.length < 3) {
    const last = normalized[normalized.length - 1] || {};
    while (normalized.length < 3) {
      normalized.push({ ...last, index: normalized.length + 1 });
    }
  }
  return normalized;
}

function normalizeDistance(distance) {
  const value = String(distance || "").toLowerCase();
  if (value === "minimal" || value === "moderate" || value === "radical") return value;
  return "moderate";
}

function isGenericNodeDetails(parsed, nodeId, nodeContext = {}) {
  const text = [
    ...(Array.isArray(parsed?.consequences) ? parsed.consequences : []),
    parsed?.why_it_changes,
    parsed?.next_question
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text) return true;
  const genericPatterns = [
    "alternate timeline",
    "separate trajectory",
    "node id",
    "lacks sufficient context",
    "unable to determine the domain"
  ];
  if (genericPatterns.some((p) => p && text.includes(p))) return true;
  return false;
}

function fallbackBranchTitle(parentTitle, questionHint, childLabel, distance) {
  const focus = shortTitle(parentTitle || "Path");
  const question = shortTitle(questionHint || "follow-up");
  if (distance === "minimal") return `${focus} - Low-Risk Variant`;
  if (distance === "radical") return `${focus} - Bold Pivot`;
  return `${focus} - Strategic Adjustment (${question || childLabel})`;
}

function cleanGeneratedTitle(rawTitle, parentTitle, userQuestion, childLabel) {
  const cleaned = String(rawTitle || "").replace(/\s+/g, " ").trim();
  if (cleaned && !/^world\s+[a-z0-9]+$/i.test(cleaned)) return limitWords(cleaned, 8);
  return fallbackBranchTitle(parentTitle, userQuestion, childLabel, "moderate");
}

function parseRoleReplyText(rawText, role, nodeTitle) {
  const text = String(rawText || "").trim();
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines
    .filter((line) => /^[-*•]\s+/.test(line))
    .map((line) => line.replace(/^[-*•]\s+/, ""))
    .slice(0, 3);
  const questionLine =
    lines.find((line) => /^q[:：]\s*/i.test(line)) ||
    [...lines].reverse().find((line) => /\?$/.test(line)) ||
    "What concrete next step can you validate in 48 hours?";
  const answerLine =
    lines.find((line) => !/^[-*•]\s+/.test(line) && !/^q[:：]\s*/i.test(line)) ||
    `From ${role.title}: focus on tradeoffs in ${nodeTitle}.`;
  const bullets =
    bulletLines.length > 0
      ? bulletLines
      : ["List assumptions", "Choose one low-risk test", "Set review checkpoint"];
  return {
    roleId: role.roleId,
    roleTitle: role.title,
    answer: limitWords(answerLine, 40),
    bullets: normalizeStringArray(bullets, 3, bullets),
    nextQuestion: questionLine.replace(/^q[:：]\s*/i, "").trim()
  };
}

function sanitizeJsonLike(text) {
  return String(text || "")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2018|\u2019/g, "'")
    .trim();
}

function repairTrailingCommas(text) {
  return String(text || "").replace(/,\s*([}\]])/g, "$1");
}

function extractFirstBalancedJsonObject(text) {
  const src = String(text || "");
  const start = src.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

function lineageToText(lineage) {
  if (!Array.isArray(lineage) || lineage.length === 0) return "none";
  return lineage.map((item) => `${item.id || "node"}:${shortTitle(item.title || "")}`).join(" -> ");
}

function buildBranchBase(parentNodeId, userQuestion, lineage) {
  const base = parentNodeId.startsWith("world_") ? parentNodeId : `world_${parentNodeId}`;
  const signature = hashText(`${userQuestion || ""}|${lineageToText(lineage)}`).slice(0, 6);
  return `${base}_${signature}`;
}

function extractTailLabel(parentNodeId) {
  return parentNodeId.replace(/^world_/, "").split("_").slice(-1)[0] || "W";
}

function normalizeBranchLabel(label) {
  return String(label || "W")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(-6);
}

function cleanOneLiner(raw, parentTitle, userQuestion, parentContext = {}) {
  const text = String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/prior path root:[^.;]+/gi, "")
    .replace(/lineage:[^.;]+/gi, "")
    .trim();
  if (!text || text.length < 8) {
    const anchor = shortTitle(parentContext.oneLiner || parentContext.delta || parentTitle);
    return `Actionable branch extending ${anchor} around "${shortTitle(userQuestion || "a new question")}".`;
  }
  return limitWords(text, 16);
}

function shortTitle(input) {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .join(" ");
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
