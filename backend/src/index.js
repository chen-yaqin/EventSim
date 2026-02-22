import "dotenv/config";
import cors from "cors";
import crypto from "node:crypto";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canCallTask,
  getProviderConfig,
  getModelForTask,
  getRouteForTask,
  hasProviderApiKey,
  MODEL_CONFIG,
  PROVIDER_CONFIG,
  runWithRuntimeConfig
} from "./config/models.js";
import { retrieveHistoricalMatch } from "./ragService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(ROOT, "..");
const CACHE_DIR = path.join(ROOT, "cache");
const DEMO_DIR = path.join(ROOT, "demo");
const FRONTEND_DIST_DIR = path.join(PROJECT_ROOT, "frontend", "dist");

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use((req, _res, next) => {
  const runtimeConfig = parseRuntimeConfigFromHeaders(req.headers || {});
  runWithRuntimeConfig(runtimeConfig, next);
});

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
const FORCE_JSON_COERCE = String(process.env.FORCE_JSON_COERCE || "1") !== "0";
ensureDir(CACHE_DIR);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "eventsim-backend",
    now: new Date().toISOString(),
    runtimeConfigSupported: true,
    anthropicConfigured: Boolean(PROVIDER_CONFIG.anthropic.apiKey),
    providersConfigured: {
      anthropic: Boolean(PROVIDER_CONFIG.anthropic.apiKey),
      openai: Boolean(PROVIDER_CONFIG.openai.apiKey),
      gemini: Boolean(PROVIDER_CONFIG.gemini.apiKey)
    },
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
  const promptVersion = "v10";
  const key = hashText(JSON.stringify({ t: eventText, o: options, p: promptVersion }));
  const cacheFile = path.join(CACHE_DIR, `plan_${key}.json`);
  if (useCache && fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    return res.json({ ...cached, meta: { ...cached.meta, cache: "hit", cacheEnabled: true } });
  }

  const ragMatch = retrieveHistoricalMatch(eventText);
  const historicalContext = ragMatch.item;

  const rootTitleGenerated = await withProviderFallback(
    "basic",
    () => buildRootTitleWithClaude(eventText),
    () => buildRootTitleFallback(eventText),
    "root_title"
  );
  const rootTitle = normalizeRootTitle(rootTitleGenerated.data?.title, eventText);

  const generated = await withProviderFallback(
    "basic",
    () => buildInitialGraphWithClaude(eventText, options, rootTitle, historicalContext),
    () => buildInitialGraphFallback(eventText, options, rootTitle),
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
      rag: {
        hit: Boolean(ragMatch.hit),
        score: Number.isFinite(ragMatch.score) ? Number(ragMatch.score.toFixed(4)) : null,
        historicalEvent: historicalContext?.historical_event || null
      },
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

  const promptVersion = "v9";
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
    "basic",
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
    childCount,
    lineage = [],
    useCache = true
  } = req.body || {};
  if (!eventHash || !parentNodeId) return res.status(400).json({ error: "eventHash and parentNodeId are required" });
  if (isRestricted(userQuestion || "")) {
    return res.status(400).json({ error: "restricted_content", message: "This query category is not supported." });
  }

  const normalizedChildCount = clampInt(childCount, 1, 8, 3);
  const promptVersion = "v7";
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
      childCount: normalizedChildCount,
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
    "branch",
    () =>
      buildBranchChildrenWithClaude(
        parentNodeId,
        parentLabel,
        parentBranchLabel,
        userQuestion,
        lineage,
        parentContext,
        normalizedChildCount
      ),
    () =>
      buildBranchChildrenFallback(
        parentNodeId,
        parentLabel,
        parentBranchLabel,
        userQuestion,
        lineage,
        parentContext,
        normalizedChildCount
      ),
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
      childCount: normalizedChildCount,
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
  const { eventHash, nodeId, nodeTitle, roleId, customRoleTitle, customRoleStyle, message, history = [], useCache = true } = req.body || {};
  if (!eventHash || !nodeId || !roleId || !message) {
    return res.status(400).json({ error: "eventHash, nodeId, roleId, message are required" });
  }
  let role = ROLE_PRESETS.find((r) => r.roleId === roleId);
  if (!role && roleId === "custom") {
    const title = limitWords(String(customRoleTitle || "").trim(), 4);
    const style = limitWords(String(customRoleStyle || "").trim(), 12);
    if (!title) {
      return res.status(400).json({ error: "customRoleTitle is required when roleId=custom" });
    }
    role = {
      roleId: "custom",
      title,
      style: style || "domain-specific perspective with explicit tradeoffs"
    };
  }
  if (!role) return res.status(400).json({ error: "invalid_role" });
  if (isRestricted(message)) {
    return res.status(400).json({
      error: "restricted_content",
      message: "This assistant is for reflection only and cannot address this category."
    });
  }

  const promptVersion = "v8";
  const key = hashText(JSON.stringify({ eventHash, nodeId, roleId, roleTitle: role.title, roleStyle: role.style, message, history, promptVersion }));
  const cacheFile = path.join(CACHE_DIR, `chat_${key}.json`);
  if (useCache && fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    return res.json({ ...cached, meta: { ...cached.meta, cache: "hit", cacheEnabled: true } });
  }

  const generated = await withProviderFallback(
    "chatbot",
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

if (fs.existsSync(FRONTEND_DIST_DIR)) {
  app.use(express.static(FRONTEND_DIST_DIR));
  app.get(/^\/(sim|demo)(\/.*)?$/, (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST_DIR, "index.html"));
  });
  app.get("/", (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST_DIR, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      service: "eventsim-backend",
      message: "Backend is running. Frontend dist not found. Start frontend dev server at http://localhost:5173.",
      health: "/api/health"
    });
  });
}

app.listen(PORT, () => {
  console.log(`[eventsim] backend listening on http://localhost:${PORT}`);
  console.log(`[eventsim] providers configured:`, {
    anthropic: Boolean(PROVIDER_CONFIG.anthropic.apiKey),
    openai: Boolean(PROVIDER_CONFIG.openai.apiKey),
    gemini: Boolean(PROVIDER_CONFIG.gemini.apiKey)
  });
  console.log(`[eventsim] models:`, MODEL_CONFIG);
});

function parseRuntimeConfigFromHeaders(headers = {}) {
  const read = (name) => {
    const value = headers[name];
    return typeof value === "string" ? value.trim() : "";
  };
  return {
    anthropicApiKey: read("x-runtime-anthropic-api-key"),
    openaiApiKey: read("x-runtime-openai-api-key"),
    geminiApiKey: read("x-runtime-gemini-api-key"),
    modelProvider: read("x-runtime-model-provider"),
    model: read("x-runtime-model"),
    basicProvider: read("x-runtime-model-basic-provider"),
    basicModel: read("x-runtime-model-basic"),
    chatbotProvider: read("x-runtime-model-chatbot-provider"),
    chatbotModel: read("x-runtime-model-chatbot"),
    branchProvider: read("x-runtime-model-branch-provider"),
    branchModel: read("x-runtime-model-branch")
  };
}

async function buildInitialGraphWithClaude(eventText, options, rootTitle = "", historicalContext = null) {
  const timeframe = options.timeframe || "1 year";
  const stakes = options.stakes || "medium";
  const goal = options.goal || "growth";
  const systemParts = [
    "You are EventSim planner.",
    "Return JSON only:",
    '{"worlds":[{"suffix":"A","distance":"minimal|moderate|radical","title":"...","delta":"...","one_liner":"...","tags":["..."],"confidence":0.0}]}',
    "Exactly 3 worlds with suffix A/B/C.",
    "Keep text concise: title <= 4 words, delta <= 8 words, one_liner <= 14 words.",
    "Avoid filler and hedging language."
  ];
  if (historicalContext) {
    systemParts.push(
      "[CRITICAL: HISTORICAL DATA GROUNDING]",
      `You must ground the branch severities using historical statistics from ${historicalContext.historical_event}.`,
      `Context: ${historicalContext.statistical_insights.baseline_context}`,
      `Minimal branch constraint: ${historicalContext.statistical_insights.minimal_impact}`,
      `Moderate branch constraint: ${historicalContext.statistical_insights.moderate_impact}`,
      `Radical branch constraint: ${historicalContext.statistical_insights.radical_impact}`,
      "Ensure branch severity levels directly reflect these probabilities."
    );
  }
  const system = systemParts.join(" ");

  let userContent = `Event:${eventText}\nTimeframe:${timeframe}\nStakes:${stakes}\nGoal:${goal}`;
  if (historicalContext) {
    userContent += `\nHistoricalProfile:${historicalContext.historical_event}`;
  }

  const text = await callModelText({
    task: "basic",
    model: getModelForTask("basic"),
    system,
    messages: [{ role: "user", content: userContent }],
    maxTokens: 500
  });
  const planSchema = '{"worlds":[{"suffix":"A","distance":"minimal|moderate|radical","title":"...","delta":"...","one_liner":"...","tags":["..."],"confidence":0.0}]}';
  let parsed = await parseOrCoerceJson(text, planSchema, "basic");
  let worlds = normalizePlanWorlds(parsed);
  if (!worlds) {
    const retryText = await callModelText({
      task: "basic",
      model: getModelForTask("basic"),
      system: [
        "You are EventSim planner.",
        "Output must be valid minified JSON only.",
        "No markdown, no prose, no code fences.",
        "Required schema:",
        '{"worlds":[{"suffix":"A","distance":"minimal|moderate|radical","title":"...","delta":"...","one_liner":"...","tags":["..."],"confidence":0.0}]}',
        "Exactly 3 items.",
        "Concise text only: title <= 4 words, delta <= 8 words, one_liner <= 14 words.",
        historicalContext
          ? [
              "[CRITICAL: HISTORICAL DATA GROUNDING]",
              `Use historical profile ${historicalContext.historical_event}.`,
              `Context: ${historicalContext.statistical_insights.baseline_context}`,
              `Minimal branch constraint: ${historicalContext.statistical_insights.minimal_impact}`,
              `Moderate branch constraint: ${historicalContext.statistical_insights.moderate_impact}`,
              `Radical branch constraint: ${historicalContext.statistical_insights.radical_impact}`
            ].join(" ")
          : ""
      ].join(" "),
      messages: [{ role: "user", content: userContent }],
      maxTokens: 420
    });
    parsed = await parseOrCoerceJson(retryText, planSchema, "basic");
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
      title: normalizeRootTitle(rootTitle, eventText),
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
  const text = await callModelText({
    task: "basic",
    model: getModelForTask("basic"),
    system: [
      "You are EventSim node analyst.",
      "Use node context to produce specific, non-generic analysis.",
      "Do not mention lack of context if context is provided.",
      "Return JSON only with consequences(3), why_it_changes, next_question, risk_flags(max2).",
      "Concise constraints:",
      "Each consequence <= 12 words.",
      "why_it_changes <= 20 words.",
      "next_question <= 14 words.",
      "Each risk_flags item should be a short risk sentence <= 10 words."
    ].join(" "),
    messages: [
      {
        role: "user",
        content: `NodeId:${nodeId}\nNodeTitle:${nodeContext.title || ""}\nNodeType:${nodeContext.type || ""}\nOneLiner:${nodeContext.oneLiner || ""}\nDelta:${nodeContext.delta || ""}\nTags:${tagText}\nParentId:${nodeContext.parentId || ""}\nLineage:${lineageText}`
      }
    ],
    maxTokens: 260
  });
  const detailsSchema = '{"consequences":["...","...","..."],"why_it_changes":"...","next_question":"...","risk_flags":["...","..."]}';
  const parsed = await parseOrCoerceJson(text, detailsSchema, "basic");
  if (!parsed) {
    console.warn("[expand] content fallback: invalid or generic node details from provider", { nodeId });
    return markContentFallback(buildNodeDetailsFallback(nodeId, nodeContext), "invalid_expand_details");
  }
  return {
    nodeId,
    consequences: normalizeStringArray(parsed.consequences, 3, [
      "Downstream priorities may reorder",
      "Execution constraints can change",
      "Second-order effects can appear quickly"
    ]).map((item) => limitWords(item, 12)),
    why_it_changes:
      typeof parsed.why_it_changes === "string"
        ? limitWords(parsed.why_it_changes, 20)
        : "Assumption changes alter feasible actions and expected outcomes.",
    next_question:
      typeof parsed.next_question === "string"
        ? limitWords(parsed.next_question, 14)
        : "What small test can validate this branch in the next 7 days?",
    risk_flags: normalizeStringArray(parsed.risk_flags, 2, [
      "Key assumption may fail under uncertainty."
    ]).map((item) => limitWords(item, 10)),
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
  parentContext = {},
  childCount = 3
) {
  const normalizedChildCount = clampInt(childCount, 1, 8, 3);
  const indexHint = Array.from({ length: normalizedChildCount }, (_v, idx) => idx + 1).join("/");
  const primaryMaxTokens = Math.min(900, 320 + normalizedChildCount * 90);
  const retryMaxTokens = Math.min(760, 260 + normalizedChildCount * 60);
  const base = buildBranchBase(parentNodeId, userQuestion, lineage);
  const lineageText = lineageToText(lineage);
  const shortLineage = lineageToText(lineage.slice(-3));
  const baseLabel = normalizeBranchLabel(parentBranchLabel || extractTailLabel(parentNodeId));
  const contextTags = Array.isArray(parentContext.tags) ? parentContext.tags.join(", ") : "";
  const text = await callModelText({
    task: "branch",
    model: getModelForTask("branch"),
    system: [
      "You are EventSim branching engine.",
      "Return JSON only:",
      '{"children":[{"index":1,"distance":"minimal|moderate|radical","title":"...","delta":"...","one_liner":"...","tags":["..."],"confidence":0.0}]}',
      `Exactly ${normalizedChildCount} children with index ${indexHint}.`,
      "Use both lineage and question.",
      "Children must be grounded in parent context and evolve from parent assumptions.",
      "Concise constraints: title <= 5 words, delta <= 8 words, one_liner <= 14 words."
    ].join(" "),
    messages: [
      {
        role: "user",
        content: `Parent:${parentTitle}\nParentLabel:${baseLabel}\nParentDelta:${parentContext.delta || ""}\nParentOneLiner:${parentContext.oneLiner || ""}\nParentTags:${contextTags}\nLineage:${shortLineage}\nQuestion:${userQuestion || ""}`
      }
    ],
    maxTokens: primaryMaxTokens
  });
  const branchSchema = '{"children":[{"index":1,"distance":"minimal|moderate|radical","title":"...","delta":"...","one_liner":"...","tags":["..."],"confidence":0.0}]}';
  let parsed = await parseOrCoerceJson(text, branchSchema, "branch");
  let normalizedChildren = normalizeBranchChildren(parsed, normalizedChildCount);
  if (!normalizedChildren) {
    const retryText = await callModelText({
      task: "branch",
      model: getModelForTask("branch"),
      system: [
        "You are EventSim branching engine.",
        "Output must be valid minified JSON only.",
        "No markdown, no prose, no code fences.",
        '{"children":[{"index":1,"distance":"minimal|moderate|radical","title":"...","delta":"...","one_liner":"...","tags":["..."],"confidence":0.0}]}',
        `Exactly ${normalizedChildCount} children.`,
        "Concise constraints: title <= 5 words, delta <= 8 words, one_liner <= 14 words."
      ].join(" "),
      messages: [{ role: "user", content: `Parent:${parentTitle}\nQuestion:${userQuestion || ""}` }],
      maxTokens: retryMaxTokens
    });
    parsed = await parseOrCoerceJson(retryText, branchSchema, "branch");
    normalizedChildren = normalizeBranchChildren(parsed, normalizedChildCount);
  }
  if (!normalizedChildren) {
    console.warn("[branch] content fallback: invalid JSON schema from provider");
    return markContentFallback(
      buildBranchChildrenFallback(
        parentNodeId,
        parentTitle,
        parentBranchLabel,
        userQuestion,
        lineage,
        parentContext,
        normalizedChildCount
      ),
      "invalid_branch_json_schema"
    );
  }

  const nodes = [];
  const edges = [];
  for (const child of normalizedChildren) {
    const idx = clampInt(child.index, 1, normalizedChildCount, 1);
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
  const text = await callModelText({
    task: "chatbot",
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
  const chatSchema = '{"answer":"...","bullets":["...","...","..."],"nextQuestion":"..."}';
  let parsed = await parseOrCoerceJson(text, chatSchema, "chatbot");
  if (!parsed) {
    const retryText = await callModelText({
      task: "chatbot",
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
    parsed = await parseOrCoerceJson(retryText, chatSchema, "chatbot");
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

async function callModelText({ task = "basic", provider, model, system, messages, maxTokens }) {
  const route = getRouteForTask(task);
  const selectedProvider = provider || route.provider;
  const selectedModel = model || route.model;
  if (!hasProviderApiKey(selectedProvider)) {
    throw new Error(`Missing API key for provider: ${selectedProvider}`);
  }
  if (selectedProvider === "openai") {
    return callOpenAIText({ model: selectedModel, system, messages, maxTokens });
  }
  if (selectedProvider === "gemini") {
    return callGeminiText({ model: selectedModel, system, messages, maxTokens });
  }
  return callAnthropicText({ model: selectedModel, system, messages, maxTokens });
}

async function callAnthropicText({ model, system, messages, maxTokens }) {
  const anthropicConfig = getProviderConfig("anthropic");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let response;
  try {
    response = await fetch(anthropicConfig.apiUrl, {
      method: "POST",
      headers: {
        "x-api-key": anthropicConfig.apiKey,
        "anthropic-version": anthropicConfig.version,
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

async function callOpenAIText({ model, system, messages, maxTokens }) {
  const openaiConfig = getProviderConfig("openai");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const assembled = [];
  if (system) assembled.push({ role: "system", content: system });
  if (Array.isArray(messages)) assembled.push(...messages.map(toOpenAIMessage));
  let response;
  try {
    response = await fetch(openaiConfig.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiConfig.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: assembled
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`OpenAI error ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .join("")
      .trim();
  }
  return "";
}

async function callGeminiText({ model, system, messages, maxTokens }) {
  const geminiConfig = getProviderConfig("gemini");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const encodedModel = encodeURIComponent(model);
  const url = `${geminiConfig.apiUrl}/${encodedModel}:generateContent?key=${encodeURIComponent(geminiConfig.apiKey)}`;
  const payload = {
    contents: Array.isArray(messages) ? messages.map(toGeminiMessage) : [],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: maxTokens
    }
  };
  if (system) {
    payload.systemInstruction = { parts: [{ text: system }] };
  }
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`Gemini error ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((item) => (typeof item?.text === "string" ? item.text : ""))
    .join("")
    .trim();
}

function toOpenAIMessage(message) {
  const role = message?.role === "assistant" ? "assistant" : "user";
  return {
    role,
    content: typeof message?.content === "string" ? message.content : String(message?.content || "")
  };
}

function toGeminiMessage(message) {
  return {
    role: message?.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof message?.content === "string" ? message.content : String(message?.content || "") }]
  };
}

function buildInitialGraphFallback(eventText, options, rootTitle = "") {
  const timeframe = options.timeframe || "1 year";
  const stakes = options.stakes || "medium";
  const goal = options.goal || "growth";
  const rootId = "root";
  const nodes = [
    {
      id: rootId,
      type: "root",
      title: normalizeRootTitle(rootTitle, eventText),
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

async function buildRootTitleWithClaude(eventText) {
  const text = await callModelText({
    task: "basic",
    model: getModelForTask("basic"),
    system: [
      "You are an event title compressor.",
      "Return plain text only, no JSON.",
      "Output exactly one short title in 2-3 words.",
      "Use concrete nouns, no punctuation, no quotes."
    ].join(" "),
    messages: [{ role: "user", content: `Event:${eventText}` }],
    maxTokens: 24
  });
  return { title: normalizeRootTitle(text, eventText) };
}

function buildRootTitleFallback(eventText) {
  const keywords = extractEventKeywords(eventText, 3);
  if (keywords.length >= 2) {
    return { title: keywords.join(" ") };
  }
  const words = String(eventText || "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return { title: words.slice(0, 3).map(toTitleWord).join(" ") };
  }
  return { title: "Core Event" };
}

function buildBranchChildrenFallback(
  parentNodeId,
  parentTitle,
  parentBranchLabel,
  userQuestion,
  lineage = [],
  parentContext = {},
  childCount = 3
) {
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
  const normalizedChildCount = clampInt(childCount, 1, 8, 3);
  for (let idx = 1; idx <= normalizedChildCount; idx += 1) {
    const variant = variants[(idx - 1) % variants.length];
    const indexText = String(idx);
    const id = `${base}_${indexText}`;
    const childLabel = `${baseLabel}${indexText}`;
    children.push({
      id,
      type: "world",
      title: fallbackBranchTitle(parentTitle, questionHint, childLabel, variant.distance),
      delta: variant.delta,
      one_liner: `${variant.line} Inherited anchor: ${parentAnchor} (question: ${questionHint})`,
      tags: [variant.distance, "branched"],
      confidence: clampNumber(variant.confidence - Math.floor((idx - 1) / variants.length) * 0.03, 0.42, 0.84, 0.62),
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
      risk_flags: ["Core assumptions remain uncertain without branch testing."],
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
    risk_flags: [
      "Tradeoff pressure can reduce option quality.",
      "Outcome uncertainty may rise with limited evidence."
    ],
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

async function withProviderFallback(task, tryPrimary, fallbackFn, label) {
  const route = getRouteForTask(task);
  if (!canCallTask(task)) {
    return { data: fallbackFn(), provider: "fallback", fallbackReason: "missing_api_key" };
  }
  try {
    return { data: await tryPrimary(), provider: route.provider, fallbackReason: null };
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

async function parseOrCoerceJson(text, schemaHint, task) {
  const parsed = safeJsonParse(text);
  const normalizedTask = task || "basic";
  if (parsed || !FORCE_JSON_COERCE || !canCallTask(normalizedTask)) return parsed;
  try {
    const repaired = await callModelText({
      task: normalizedTask,
      model: getModelForTask(normalizedTask),
      system: [
        "You are a strict JSON formatter.",
        "Convert the raw content into valid minified JSON.",
        "Return JSON only with no markdown and no explanation.",
        `Target schema: ${schemaHint}`
      ].join(" "),
      messages: [{ role: "user", content: `Raw content:\n${String(text || "").slice(0, 5000)}` }],
      maxTokens: 520
    });
    return safeJsonParse(repaired);
  } catch {
    return null;
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

function normalizeBranchChildren(parsed, childCount = 3) {
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
  const normalizedChildCount = clampInt(childCount, 1, 8, 3);
  const normalized = children.slice(0, normalizedChildCount).map((child, idx) => ({
    ...(child || {}),
    index: clampInt(child?.index, 1, normalizedChildCount, idx + 1),
    distance: normalizeDistance(child?.distance)
  }));
  if (normalized.length < normalizedChildCount) {
    const last = normalized[normalized.length - 1] || {};
    while (normalized.length < normalizedChildCount) {
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

function normalizeRootTitle(rawTitle, eventText = "") {
  const cleaned = String(rawTitle || "")
    .replace(/[`"'.,;:!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 3).map(toTitleWord).join(" ");
  if (words.length === 1) {
    const keywords = extractEventKeywords(eventText, 2);
    if (keywords.length > 0) return [toTitleWord(words[0]), keywords[0]].slice(0, 2).join(" ");
    return toTitleWord(words[0]);
  }
  return buildRootTitleFallback(eventText).title;
}

function extractEventKeywords(text, maxWords = 3) {
  const stop = new Set([
    "the",
    "a",
    "an",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "and",
    "or",
    "but",
    "with",
    "without",
    "from",
    "by",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "as",
    "into",
    "through",
    "throughout",
    "when",
    "however",
    "which",
    "their",
    "they",
    "them",
    "our",
    "your",
    "my",
    "any",
    "not",
    "did",
    "do",
    "does",
    "done",
    "had",
    "has",
    "have",
    "member",
    "group",
    "project",
    "process",
    "final",
    "report"
  ]);
  const tokens = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  const seen = new Set();
  const result = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    result.push(toTitleWord(token));
    if (result.length >= maxWords) break;
  }
  return result;
}

function toTitleWord(word) {
  const lower = String(word || "").toLowerCase();
  if (!lower) return "";
  return lower.charAt(0).toUpperCase() + lower.slice(1);
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
