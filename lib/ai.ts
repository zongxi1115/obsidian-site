/**
 * AI 问答用的端点配置。
 * 任何 OpenAI 兼容的服务都能接：OpenRouter、官方 OpenAI、各种中转站、自建服务，
 * 换服务商只要改 AI_BASE_URL 和 AI_MODEL，代码不用动。
 *
 * 注意 AI_MODEL 要填你那个端点认识的模型 ID
 * （OpenRouter 是 anthropic/claude-haiku-4.5 这种带前缀的写法，中转站多半是 gpt-4o-mini 这种）。
 */
export const aiConfig = {
  baseURL: process.env.AI_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
  apiKey: process.env.AI_API_KEY?.trim() || '',
  model: process.env.AI_MODEL?.trim() || 'anthropic/claude-haiku-4.5',
};

/** 没配 key 就整个不显示「Ask AI」，免得点了报错 */
export const aiEnabled = aiConfig.apiKey.length > 0;
