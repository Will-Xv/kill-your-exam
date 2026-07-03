// 统一 AI/API 层错误分类:让前端能明确告诉用户"这是 API 的问题,不是你的问题"
export class AiError extends Error {
  constructor(type, message, retryable = false) {
    super(message);
    this.isAiError = true;
    this.type = type;
    this.retryable = retryable;
  }
}

const FRIENDLY = {
  no_key: "还没有配置 AI 服务的密钥(API key)。",
  bad_key: "AI 服务的密钥(API key)无效或已过期。",
  quota: "AI 服务的额度已用完或触发了用量限制。",
  rate_limit: "AI 服务暂时繁忙(请求太频繁),稍后会自动恢复。",
  server: "AI 服务商(Google Gemini)服务器出现故障。",
  network: "服务器无法连接到 AI 服务(网络问题)。",
  bad_response: "AI 返回了无法解析的内容,已重试仍失败。",
  unknown: "AI 服务出现未知错误。"
};

export function classifyError(e) {
  if (e?.isAiError) return e;
  const msg = String(e?.message || e || "");
  const status = e?.status || e?.code || (msg.match(/\b(4\d\d|5\d\d)\b/) || [])[0];
  const s = Number(status);
  if (/api.?key|API_KEY_INVALID|PERMISSION_DENIED|unauthor/i.test(msg) || s === 401 || s === 403)
    return new AiError("bad_key", msg);
  if (/RESOURCE_EXHAUSTED|quota|billing/i.test(msg) && !/rate/i.test(msg)) return new AiError("quota", msg);
  if (s === 429 || /rate.?limit|RESOURCE_EXHAUSTED/i.test(msg)) return new AiError("rate_limit", msg, true);
  if (s >= 500 || /internal|unavailable|overloaded/i.test(msg)) return new AiError("server", msg, true);
  if (/fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|network/i.test(msg)) return new AiError("network", msg, true);
  return new AiError("unknown", msg);
}

// API route 里统一使用:把任何错误转成给前端的 JSON
export function aiErrorResponse(e) {
  const err = classifyError(e);
  console.error("[AI-ERROR]", err.type, err.message);
  return Response.json(
    {
      aiError: true,
      type: err.type,
      friendly: FRIENDLY[err.type] || FRIENDLY.unknown,
      detail: err.message?.slice(0, 500)
    },
    { status: 502 }
  );
}
