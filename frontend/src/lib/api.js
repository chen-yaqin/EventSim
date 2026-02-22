const BASE_URL = resolveBaseUrl();
const RUNTIME_CONFIG_KEY = "eventsim.runtime_config.v1";
let runtimeHeaders = {};

export function loadRuntimeConfig() {
  try {
    const raw = localStorage.getItem(RUNTIME_CONFIG_KEY);
    if (!raw) return emptyRuntimeConfig();
    return sanitizeRuntimeConfig(JSON.parse(raw));
  } catch {
    return emptyRuntimeConfig();
  }
}

export function saveRuntimeConfig(config) {
  const sanitized = sanitizeRuntimeConfig(config);
  localStorage.setItem(RUNTIME_CONFIG_KEY, JSON.stringify(sanitized));
  applyRuntimeConfig(sanitized);
  return sanitized;
}

export function clearRuntimeConfig() {
  localStorage.removeItem(RUNTIME_CONFIG_KEY);
  const config = emptyRuntimeConfig();
  applyRuntimeConfig(config);
  return config;
}

export function applyRuntimeConfig(config) {
  const safe = sanitizeRuntimeConfig(config);
  runtimeHeaders = buildRuntimeHeaders(safe);
}

applyRuntimeConfig(loadRuntimeConfig());

export async function fetchPlan(payload) {
  const response = await fetch(`${BASE_URL}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...runtimeHeaders },
    body: JSON.stringify(payload)
  });
  return parseJson(response);
}

export async function fetchExpand(payload) {
  const response = await fetch(`${BASE_URL}/api/expand`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...runtimeHeaders },
    body: JSON.stringify(payload)
  });
  return parseJson(response);
}

export async function fetchBranch(payload) {
  const response = await fetch(`${BASE_URL}/api/branch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...runtimeHeaders },
    body: JSON.stringify(payload)
  });
  return parseJson(response);
}

export async function fetchChat(payload) {
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...runtimeHeaders },
    body: JSON.stringify(payload)
  });
  return parseJson(response);
}

export async function fetchDemo(id) {
  const response = await fetch(`${BASE_URL}/api/demo/${id}`);
  return parseJson(response);
}

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || "Request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function emptyRuntimeConfig() {
  return {
    anthropicApiKey: "",
    openaiApiKey: "",
    geminiApiKey: "",
    modelProvider: "anthropic",
    model: "",
    basicProvider: "anthropic",
    basicModel: "",
    chatbotProvider: "anthropic",
    chatbotModel: "",
    branchProvider: "anthropic",
    branchModel: ""
  };
}

function sanitizeRuntimeConfig(input) {
  const next = { ...emptyRuntimeConfig(), ...(input || {}) };
  return {
    anthropicApiKey: String(next.anthropicApiKey || "").trim(),
    openaiApiKey: String(next.openaiApiKey || "").trim(),
    geminiApiKey: String(next.geminiApiKey || "").trim(),
    modelProvider: normalizeProvider(next.modelProvider),
    model: String(next.model || "").trim(),
    basicProvider: normalizeProvider(next.basicProvider),
    basicModel: String(next.basicModel || "").trim(),
    chatbotProvider: normalizeProvider(next.chatbotProvider),
    chatbotModel: String(next.chatbotModel || "").trim(),
    branchProvider: normalizeProvider(next.branchProvider),
    branchModel: String(next.branchModel || "").trim()
  };
}

function normalizeProvider(value) {
  const provider = String(value || "").toLowerCase().trim();
  if (provider === "openai" || provider === "gemini" || provider === "anthropic") return provider;
  return "anthropic";
}

function buildRuntimeHeaders(config) {
  const headers = {};
  putHeader(headers, "x-runtime-anthropic-api-key", config.anthropicApiKey);
  putHeader(headers, "x-runtime-openai-api-key", config.openaiApiKey);
  putHeader(headers, "x-runtime-gemini-api-key", config.geminiApiKey);
  putHeader(headers, "x-runtime-model-provider", config.modelProvider);
  putHeader(headers, "x-runtime-model", config.model);
  putHeader(headers, "x-runtime-model-basic-provider", config.basicProvider);
  putHeader(headers, "x-runtime-model-basic", config.basicModel);
  putHeader(headers, "x-runtime-model-chatbot-provider", config.chatbotProvider);
  putHeader(headers, "x-runtime-model-chatbot", config.chatbotModel);
  putHeader(headers, "x-runtime-model-branch-provider", config.branchProvider);
  putHeader(headers, "x-runtime-model-branch", config.branchModel);
  return headers;
}

function putHeader(headers, name, value) {
  const text = String(value || "").trim();
  if (text) headers[name] = text;
}

function resolveBaseUrl() {
  const fromEnv = String(import.meta.env.VITE_API_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (import.meta.env.DEV) return "http://localhost:8787";
  return window.location.origin;
}
