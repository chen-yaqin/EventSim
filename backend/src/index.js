import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
  { roleId: "you_now", title: "You-Now", focus: "immediate constraints and practicality" },
  { roleId: "you_5y", title: "You-in-5-Years", focus: "long-term compounding and regret minimization" },
  { roleId: "neutral_advisor", title: "Neutral Advisor", focus: "balanced tradeoff framing and risk calibration" }
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
  const promptVersion = "v1";
  const key = hashText(JSON.stringify({ t: eventText, o: options, p: promptVersion }));
  const cacheFile = path.join(CACHE_DIR, `plan_${key}.json`);

  if (fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    return res.json({
      ...cached,
      meta: { ...cached.meta, cache: "hit" }
    });
  }

  const graph = buildGraph(eventText, options);
  const payload = {
    graph,
    meta: {
      cache: "miss",
      eventHash,
      promptVersion,
      generatedAt: new Date().toISOString(),
      tokenEstimate: 780
    }
  };

  writeJson(cacheFile, payload);
  res.json(payload);
});

app.post("/api/expand", (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "local";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "rate_limited", message: "Too many requests. Please wait a few seconds." });
  }

  const { eventHash, nodeId } = req.body || {};
  if (!eventHash || !nodeId) {
    return res.status(400).json({ error: "eventHash and nodeId are required" });
  }

  const promptVersion = "v1";
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
      tokenEstimate: 360
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

function buildGraph(eventText, options) {
  const timeframe = options.timeframe || "1 year";
  const stakes = options.stakes || "medium";
  const goal = options.goal || "growth";
  const worldCount = clampInt(options.worldCount, 1, 3, 3);
  const roleCount = clampInt(options.roleCount, 2, 3, 3);

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
      worldId: null,
      roleId: null,
      data: { timeframe, stakes, goal, eventText }
    }
  ];

  const edges = [];
  const worldBlueprints = [
    {
      worldId: "world_a",
      distance: "minimal",
      title: "World A: Minimal shift",
      delta: "Change one controllable factor",
      one_liner: "Small adjustment, most assumptions remain intact.",
      changedVariables: ["single tactical decision"],
      plausibleBecause: "It is directly controllable this week.",
      constants: ["core goals", "current constraints"]
    },
    {
      worldId: "world_b",
      distance: "moderate",
      title: "World B: Moderate shift",
      delta: "Decision and one constraint change",
      one_liner: "A meaningful pivot with moderate disruption.",
      changedVariables: ["primary decision", "resource constraint"],
      plausibleBecause: "Requires coordination but remains feasible.",
      constants: ["identity-level values", "timeline horizon"]
    },
    {
      worldId: "world_c",
      distance: "radical",
      title: "World C: Radical shift",
      delta: "Environment and goal assumptions shift",
      one_liner: "High-variance move with a different strategic frame.",
      changedVariables: ["operating environment", "goal priorities"],
      plausibleBecause: "A deliberate reset can be chosen intentionally.",
      constants: ["core strengths", "non-negotiable responsibilities"]
    }
  ].slice(0, worldCount);

  for (const world of worldBlueprints) {
    nodes.push({
      id: world.worldId,
      type: "world",
      title: world.title,
      delta: world.delta,
      one_liner: world.one_liner,
      tags: [world.distance, goal],
      confidence: world.distance === "radical" ? 0.59 : world.distance === "moderate" ? 0.68 : 0.74,
      parentId: rootId,
      worldId: world.worldId,
      roleId: null,
      data: {
        distance: world.distance,
        changedVariables: world.changedVariables,
        plausibleBecause: world.plausibleBecause,
        constants: world.constants
      }
    });

    edges.push({
      id: `e_${rootId}_${world.worldId}`,
      source: rootId,
      target: world.worldId,
      label: "counterfactual"
    });

    for (const role of ROLE_PRESETS.slice(0, roleCount)) {
      const roleNodeId = `${world.worldId}_${role.roleId}`;
      nodes.push({
        id: roleNodeId,
        type: "role",
        title: role.title,
        delta: role.focus,
        one_liner: oneLinerForRole(role.roleId, world.distance),
        tags: [role.roleId, world.distance],
        confidence: confidenceByRole(role.roleId),
        parentId: world.worldId,
        worldId: world.worldId,
        roleId: role.roleId
      });

      edges.push({
        id: `e_${world.worldId}_${roleNodeId}`,
        source: world.worldId,
        target: roleNodeId,
        label: "role lens"
      });
    }
  }

  return { nodes, edges };
}

function buildNodeDetails(nodeId) {
  const isWorld = /^world_[abc]$/.test(nodeId);
  const isRole = /^world_[abc]_(you_now|you_5y|neutral_advisor)$/.test(nodeId);
  const roleId = isRole ? nodeId.split("_").slice(2).join("_") : null;

  if (isWorld) {
    return {
      nodeId,
      consequences: [
        "Primary tradeoff becomes clearer",
        "Execution friction changes materially",
        "Second-order effects emerge quickly"
      ],
      why_it_changes:
        "Changing assumptions alters feasible actions and expected payoffs. The timeline and constraints force different priorities.",
      next_question: "Which variable in this world is easiest to validate this week?",
      risk_flags: ["uncertainty", "tradeoff"],
      assumptions: ["Context remains mostly stable", "Decision owner has agency"],
      checklist: ["Define success metric", "Run one low-cost test", "Review downside limits"]
    };
  }

  if (isRole) {
    return detailsForRole(nodeId, roleId);
  }

  return {
    nodeId,
    consequences: ["No additional details available", "Try selecting a world or role", "Use compare mode for deltas"],
    why_it_changes: "This node type is informational and does not hold expanded analysis.",
    next_question: "Which role perspective should you inspect next?",
    risk_flags: [],
    assumptions: [],
    checklist: []
  };
}

function detailsForRole(nodeId, roleId) {
  if (roleId === "you_now") {
    return {
      nodeId,
      consequences: ["Cashflow and time pressure dominate", "Operational complexity matters most", "Stress load changes near-term quality"],
      why_it_changes:
        "This perspective prioritizes immediate constraints and execution reliability. It discounts uncertain long-term upside when present costs are high.",
      next_question: "What decision lowers stress without closing important future options?",
      risk_flags: ["tradeoff"],
      assumptions: ["Bandwidth is limited", "Short-term stability matters"],
      checklist: ["List hard constraints", "Cut one optional task", "Choose reversible action first"]
    };
  }

  if (roleId === "you_5y") {
    return {
      nodeId,
      consequences: ["Compounding effects dominate", "Skill trajectory matters more", "Short discomfort may be acceptable"],
      why_it_changes:
        "This lens values long-term option value and regret minimization. It tolerates temporary instability when it improves future strategic position.",
      next_question: "Which choice creates the strongest learning compounding over 5 years?",
      risk_flags: ["uncertainty"],
      assumptions: ["Future flexibility has high value", "Delayed payoff is acceptable"],
      checklist: ["Define 5-year objective", "Score compounding potential", "Stress-test downside scenario"]
    };
  }

  return {
    nodeId,
    consequences: ["Both upside and downside are surfaced", "Hidden assumptions become explicit", "Decision quality improves with framing"],
    why_it_changes:
      "A neutral advisor balances values, constraints, and uncertainty rather than optimizing one dimension. This can reveal stable choices across worlds.",
    next_question: "What option remains robust across at least two worlds?",
    risk_flags: ["tradeoff", "uncertainty"],
    assumptions: ["Inputs are incomplete", "No option is risk-free"],
    checklist: ["List alternatives", "Compare downside asymmetry", "Pick trigger for revisiting decision"]
  };
}

function oneLinerForRole(roleId, distance) {
  if (roleId === "you_now") return `Immediate feasibility under ${distance} change.`;
  if (roleId === "you_5y") return `Long-term compounding under ${distance} change.`;
  return `Balanced tradeoff framing under ${distance} change.`;
}

function confidenceByRole(roleId) {
  if (roleId === "neutral_advisor") return 0.72;
  if (roleId === "you_5y") return 0.67;
  return 0.7;
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
  return RESTRICTED_PATTERNS.some((p) => p.test(text));
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isRateLimited(key) {
  const now = Date.now();
  const windowMs = 6_000;
  const maxRequests = 6;
  const queue = rateState.get(key) || [];
  const fresh = queue.filter((t) => now - t < windowMs);
  if (fresh.length >= maxRequests) return true;
  fresh.push(now);
  rateState.set(key, fresh);
  return false;
}
