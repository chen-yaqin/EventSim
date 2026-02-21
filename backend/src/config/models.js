const fallbackModel = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";

export const MODEL_CONFIG = {
  basic: process.env.ANTHROPIC_MODEL_BASIC || fallbackModel,
  chatbot: process.env.ANTHROPIC_MODEL_CHATBOT || fallbackModel,
  branch: process.env.ANTHROPIC_MODEL_BRANCH || fallbackModel
};

export const ANTHROPIC_CONFIG = {
  apiKey: process.env.ANTHROPIC_API_KEY || "",
  version: process.env.ANTHROPIC_VERSION || "2023-06-01",
  apiUrl: process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages"
};

export function getModelForTask(taskName) {
  return MODEL_CONFIG[taskName] || fallbackModel;
}
