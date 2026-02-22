import { AsyncLocalStorage } from "node:async_hooks";

const PROVIDERS = new Set(["anthropic", "openai", "gemini"]);
const runtimeConfigStore = new AsyncLocalStorage();

function normalizeProvider(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return PROVIDERS.has(normalized) ? normalized : "anthropic";
}

function defaultModelForProvider(provider) {
  if (provider === "openai") return "gpt-4o-mini";
  if (provider === "gemini") return "gemini-2.0-flash";
  return "claude-3-5-haiku-latest";
}

const fallbackProvider = normalizeProvider(process.env.MODEL_PROVIDER || "anthropic");
const fallbackModel =
  process.env.MODEL || process.env.ANTHROPIC_MODEL || defaultModelForProvider(fallbackProvider);

function resolveTaskRoute(taskName, legacyAnthropicModel) {
  const envUpper = taskName.toUpperCase();
  const provider = normalizeProvider(process.env[`MODEL_${envUpper}_PROVIDER`] || fallbackProvider);
  const model =
    process.env[`MODEL_${envUpper}`] ||
    (provider === "anthropic" ? process.env[legacyAnthropicModel] : "") ||
    fallbackModel ||
    defaultModelForProvider(provider);
  return { provider, model };
}

const DEFAULT_ROUTE = { provider: fallbackProvider, model: fallbackModel };

export const MODEL_CONFIG = {
  basic: resolveTaskRoute("basic", "ANTHROPIC_MODEL_BASIC"),
  chatbot: resolveTaskRoute("chatbot", "ANTHROPIC_MODEL_CHATBOT"),
  branch: resolveTaskRoute("branch", "ANTHROPIC_MODEL_BRANCH")
};

export const PROVIDER_CONFIG = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    version: process.env.ANTHROPIC_VERSION || "2023-06-01",
    apiUrl: process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages"
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    apiUrl: process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions"
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    apiUrl:
      process.env.GEMINI_API_URL ||
      "https://generativelanguage.googleapis.com/v1beta/models"
  }
};

export const ANTHROPIC_CONFIG = PROVIDER_CONFIG.anthropic;

function getRuntimeConfig() {
  return runtimeConfigStore.getStore() || null;
}

function getRuntimeString(runtime, key) {
  if (!runtime || typeof runtime !== "object") return "";
  const value = String(runtime[key] || "").trim();
  return value;
}

function hasRuntimeOverrides(runtime) {
  if (!runtime || typeof runtime !== "object") return false;
  const keys = [
    "anthropicApiKey",
    "openaiApiKey",
    "geminiApiKey",
    "modelProvider",
    "model",
    "basicProvider",
    "basicModel",
    "chatbotProvider",
    "chatbotModel",
    "branchProvider",
    "branchModel"
  ];
  return keys.some((key) => Boolean(getRuntimeString(runtime, key)));
}

function getRuntimeRoute(taskName, runtime) {
  const lowerTask = String(taskName || "basic").toLowerCase();
  const providerKey = `${lowerTask}Provider`;
  const modelKey = `${lowerTask}Model`;
  const baseRoute = MODEL_CONFIG[lowerTask] || DEFAULT_ROUTE;
  const taskProvider = getRuntimeString(runtime, providerKey);
  const globalProvider = getRuntimeString(runtime, "modelProvider");
  const taskModel = getRuntimeString(runtime, modelKey);
  const globalModel = getRuntimeString(runtime, "model");
  const provider = normalizeProvider(taskProvider || globalProvider || baseRoute.provider);
  let model = baseRoute.model;
  if (taskModel || globalModel) {
    model = taskModel || globalModel;
  } else if (provider !== baseRoute.provider) {
    // If user overrides provider but leaves model empty, pick provider default.
    model = defaultModelForProvider(provider);
  }
  return { provider, model };
}

export function runWithRuntimeConfig(runtimeConfig, fn) {
  return runtimeConfigStore.run(runtimeConfig || {}, fn);
}

export function getRouteForTask(taskName) {
  const runtime = getRuntimeConfig();
  if (hasRuntimeOverrides(runtime)) return getRuntimeRoute(taskName, runtime);
  return MODEL_CONFIG[taskName] || DEFAULT_ROUTE;
}

export function getModelForTask(taskName) {
  return getRouteForTask(taskName).model;
}

export function hasProviderApiKey(provider) {
  const runtime = getRuntimeConfig();
  if (hasRuntimeOverrides(runtime)) {
    const runtimeKey = `${provider}ApiKey`;
    const runtimeApiKey = getRuntimeString(runtime, runtimeKey);
    if (runtimeApiKey) return true;
  }
  return Boolean(PROVIDER_CONFIG[provider]?.apiKey);
}

export function canCallTask(taskName) {
  const route = getRouteForTask(taskName);
  return hasProviderApiKey(route.provider);
}

export function getProviderConfig(provider) {
  const base = PROVIDER_CONFIG[provider] || {};
  const runtime = getRuntimeConfig();
  if (!hasRuntimeOverrides(runtime)) return base;
  const runtimeKey = `${provider}ApiKey`;
  const runtimeApiKey = getRuntimeString(runtime, runtimeKey);
  if (!runtimeApiKey) return base;
  return { ...base, apiKey: runtimeApiKey };
}
