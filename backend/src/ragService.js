import fs from "node:fs";
import path from "node:path";
import Fuse from "fuse.js";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.join(__dirname, "../data/fema_historical_insights.json");
let historicalData = [];

try {
  historicalData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
} catch (error) {
  console.error(`[RAG] Failed to load historical data from ${dataPath}`, error);
}

const fuseOptions = {
  includeScore: true,
  threshold: 0.4,
  ignoreLocation: true,
  keys: [
    { name: "keywords", weight: 0.6 },
    { name: "historical_event", weight: 0.4 }
  ]
};

const fuse = new Fuse(historicalData, fuseOptions);
const MAX_ACCEPTED_SCORE = 0.55;
const STATE_CODES = new Set(
  historicalData
    .map((item) => (Array.isArray(item.keywords) ? String(item.keywords[0] || "").toLowerCase() : ""))
    .filter((code) => /^[a-z]{2}$/.test(code))
);
const INCIDENT_KEYWORDS = Array.from(
  new Set(
    historicalData
      .map((item) => (Array.isArray(item.keywords) ? String(item.keywords[1] || "").toLowerCase() : ""))
      .filter(Boolean)
  )
);

const STATE_ALIASES = new Map([
  ["alabama", "al"],
  ["al", "alabama"],
  ["alaska", "ak"],
  ["ak", "alaska"],
  ["arizona", "az"],
  ["az", "arizona"],
  ["arkansas", "ar"],
  ["ar", "arkansas"],
  ["california", "ca"],
  ["ca", "california"],
  ["colorado", "co"],
  ["co", "colorado"],
  ["connecticut", "ct"],
  ["ct", "connecticut"],
  ["delaware", "de"],
  ["de", "delaware"],
  ["florida", "fl"],
  ["fl", "florida"],
  ["georgia", "ga"],
  ["ga", "georgia"],
  ["hawaii", "hi"],
  ["hi", "hawaii"],
  ["idaho", "id"],
  ["id", "idaho"],
  ["illinois", "il"],
  ["il", "illinois"],
  ["indiana", "in"],
  ["in", "indiana"],
  ["iowa", "ia"],
  ["ia", "iowa"],
  ["kansas", "ks"],
  ["ks", "kansas"],
  ["kentucky", "ky"],
  ["ky", "kentucky"],
  ["louisiana", "la"],
  ["la", "louisiana"],
  ["maine", "me"],
  ["me", "maine"],
  ["maryland", "md"],
  ["md", "maryland"],
  ["massachusetts", "ma"],
  ["ma", "massachusetts"],
  ["michigan", "mi"],
  ["mi", "michigan"],
  ["minnesota", "mn"],
  ["mn", "minnesota"],
  ["mississippi", "ms"],
  ["ms", "mississippi"],
  ["missouri", "mo"],
  ["mo", "missouri"],
  ["montana", "mt"],
  ["mt", "montana"],
  ["nebraska", "ne"],
  ["ne", "nebraska"],
  ["nevada", "nv"],
  ["nv", "nevada"],
  ["new hampshire", "nh"],
  ["nh", "new hampshire"],
  ["new jersey", "nj"],
  ["nj", "new jersey"],
  ["new mexico", "nm"],
  ["nm", "new mexico"],
  ["new york", "ny"],
  ["ny", "new york"],
  ["north carolina", "nc"],
  ["nc", "north carolina"],
  ["north dakota", "nd"],
  ["nd", "north dakota"],
  ["ohio", "oh"],
  ["oh", "ohio"],
  ["oklahoma", "ok"],
  ["ok", "oklahoma"],
  ["oregon", "or"],
  ["or", "oregon"],
  ["pennsylvania", "pa"],
  ["pa", "pennsylvania"],
  ["rhode island", "ri"],
  ["ri", "rhode island"],
  ["south carolina", "sc"],
  ["sc", "south carolina"],
  ["south dakota", "sd"],
  ["sd", "south dakota"],
  ["tennessee", "tn"],
  ["tn", "tennessee"],
  ["texas", "tx"],
  ["tx", "texas"],
  ["utah", "ut"],
  ["ut", "utah"],
  ["vermont", "vt"],
  ["vt", "vermont"],
  ["virginia", "va"],
  ["va", "virginia"],
  ["washington", "wa"],
  ["wa", "washington"],
  ["west virginia", "wv"],
  ["wv", "west virginia"],
  ["wisconsin", "wi"],
  ["wi", "wisconsin"],
  ["wyoming", "wy"],
  ["wy", "wyoming"]
]);

const QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "and",
  "or",
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
  "when",
  "if",
  "hits",
  "hit",
  "severe",
  "major",
  "very"
]);

function compactQuery(userEvent) {
  const raw = String(userEvent || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
  const tokens = raw
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !QUERY_STOP_WORDS.has(token));

  const normalizedTokens = [];
  for (const token of tokens) {
    const alias = STATE_ALIASES.get(token);
    if (alias && token.length > 2) {
      normalizedTokens.push(alias);
      continue;
    }
    normalizedTokens.push(token);
  }

  return Array.from(new Set(normalizedTokens)).join(" ");
}

function bestSearchResult(queries, preferredStateCode = "") {
  let best = null;
  let bestForState = null;
  for (const query of queries) {
    if (!query) continue;
    const results = fuse.search(query);
    if (!results.length) continue;
    if (preferredStateCode) {
      const stateScoped = results.find((result) =>
        Array.isArray(result.item?.keywords) && result.item.keywords.includes(preferredStateCode)
      );
      if (stateScoped && (!bestForState || stateScoped.score < bestForState.score)) {
        bestForState = stateScoped;
      }
    }
    if (!best || results[0].score < best.score) {
      best = results[0];
    }
  }
  return bestForState || best;
}

function extractStateCode(query) {
  const original = String(query || "");
  const upperTwoLetterTokens = original.match(/\b[A-Z]{2}\b/g) || [];
  for (const token of upperTwoLetterTokens) {
    const lower = token.toLowerCase();
    if (STATE_CODES.has(lower)) return lower;
  }

  const tokens = original.toLowerCase().match(/[a-z]{2,}/g) || [];
  for (const token of tokens) {
    const alias = STATE_ALIASES.get(token);
    if (alias && STATE_CODES.has(alias)) return alias;
    if (STATE_CODES.has(token) && token !== "in") return token;
  }
  return "";
}

function extractIncidentKeyword(query) {
  const normalized = String(query || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");

  const aliases = [
    ["earthquake", "earthquake"],
    ["earthquakes", "earthquake"],
    ["flood", "flood"],
    ["floods", "flood"],
    ["tornado", "tornado"],
    ["tornados", "tornado"],
    ["hurricane", "hurricane"],
    ["hurricanes", "hurricane"],
    ["storm", "severe storm(s)"],
    ["severe storm", "severe storm(s)"],
    ["drought", "drought"],
    ["snow", "snow"],
    ["blizzard", "snow"],
    ["fire", "fire"],
    ["biological", "biological"],
    ["pandemic", "biological"]
  ];

  for (const [needle, canonical] of aliases) {
    if (!normalized.includes(needle)) continue;
    const match = INCIDENT_KEYWORDS.find((keyword) => keyword.includes(canonical));
    if (match) return match;
  }

  for (const keyword of INCIDENT_KEYWORDS) {
    const probe = keyword.replace(/[()]/g, "").trim();
    if (probe && normalized.includes(probe)) return keyword;
  }

  return "";
}

function buildFocusedQuery(userEvent) {
  const stateCode = extractStateCode(userEvent);
  const incident = extractIncidentKeyword(userEvent);
  if (stateCode && incident) return `${incident} ${stateCode}`;
  if (incident) return incident;
  if (stateCode) return stateCode;
  return "";
}

export function retrieveHistoricalContext(userEvent) {
  const match = retrieveHistoricalMatch(userEvent);
  return match?.item || null;
}

export function retrieveHistoricalMatch(userEvent) {
  const query = String(userEvent || "").trim();
  if (!query) {
    return { hit: false, score: null, item: null, query: "", compactQuery: "", focusedQuery: "" };
  }

  const compact = compactQuery(query);
  const stateCode = extractStateCode(query);
  const focused = buildFocusedQuery(query);
  const best = bestSearchResult([focused, compact, query], stateCode);

  if (best && best.score <= MAX_ACCEPTED_SCORE) {
    console.log(`[RAG Hit] Matched historical profile: ${best.item.historical_event}`);
    return {
      hit: true,
      score: best.score,
      item: best.item,
      query,
      compactQuery: compact,
      focusedQuery: focused
    };
  }

  console.log("[RAG Miss] No matching historical profile. Falling back to generic generation.");
  return {
    hit: false,
    score: best?.score ?? null,
    item: null,
    query,
    compactQuery: compact,
    focusedQuery: focused
  };
}
