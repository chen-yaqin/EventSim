const PROVIDERS = new Set(["anthropic", "openai", "gemini"]);

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

export function getRouteForTask(taskName) {
  return MODEL_CONFIG[taskName] || DEFAULT_ROUTE;
}

export function getModelForTask(taskName) {
  return getRouteForTask(taskName).model;
}

export function hasProviderApiKey(provider) {
  return Boolean(PROVIDER_CONFIG[provider]?.apiKey);
}

export function canCallTask(taskName) {
  const route = getRouteForTask(taskName);
  return hasProviderApiKey(route.provider);
}
