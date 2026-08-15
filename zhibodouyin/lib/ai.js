const defaultSystemPrompt = `你是“灵图AI”直播间的中文产品讲解员。灵图AI是一套完整的AI图片创作工作台，支持提示词优化、参考图理解、多模型生图、图片续改、灵感空间、素材库和作品管理。
要求：
1. 像真人主播一样自然、友好。直播主讲稿按任务要求输出5到8句并保持连续；弹幕回复和欢迎语保持1到3句，每句尽量简洁。
2. 先回答观众问题，再自然带出平台功能；不要自称机器人，不要夸大效果。
3. 主讲稿重点说明平台优势、解决的实际问题和适用场景，并自然说明当前免费试用、2K每张0.02元、4K每张0.09元，引导观众关注后领取试用入口。不要主动询问观众想看什么，不要要求发弹幕点播。
4. 不承诺收益，不制造焦虑，不使用绝对化广告词，不输出违法违规内容。
5. 只输出准备直接播报的纯文本，不要标题、列表、Markdown或引号。`;

function compactText(value, max = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function aiStatus() {
  return {
    enabled: Boolean(process.env.AI_API_KEY && process.env.AI_MODEL),
    model: process.env.AI_MODEL || "",
    provider: process.env.AI_PROVIDER_NAME || "OpenAI 兼容接口",
    mode: process.env.AI_API_MODE || "auto"
  };
}

function responseText(payload) {
  if (payload?.output_text) return payload.output_text;
  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) if (content?.text) parts.push(content.text);
  }
  return parts.join("\n");
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `AI HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function generateDirectorText({ kind, user, text, scene, recent = [] }) {
  if (!aiStatus().enabled) return null;
  const baseUrl = String(process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const context = [
    `任务类型：${compactText(kind, 700)}`,
    scene ? `当前演示：${compactText(scene, 160)}` : "",
    user ? `观众昵称：${compactText(user, 30)}` : "",
    text ? `观众内容：${compactText(text, 240)}` : "",
    recent.length ? `最近互动：${recent.slice(-4).map(item => `${compactText(item.user, 20)}：${compactText(item.text, 80)}`).join("；")}` : ""
  ].filter(Boolean).join("\n");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_TIMEOUT_MS || 12000));
  try {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AI_API_KEY}` };
    const system = process.env.AI_SYSTEM_PROMPT || defaultSystemPrompt;
    const mode = String(process.env.AI_API_MODE || "auto").toLowerCase();
    if (mode === "responses") {
      const payload = await requestJson(`${baseUrl}/responses`, { method: "POST", headers, body: JSON.stringify({ model: process.env.AI_MODEL, instructions: system, input: context, temperature: Number(process.env.AI_TEMPERATURE || 0.72), max_output_tokens: Number(process.env.AI_MAX_TOKENS || 180) }), signal: controller.signal });
      return compactText(responseText(payload), 600) || null;
    }
    try {
      const payload = await requestJson(`${baseUrl}/chat/completions`, { method: "POST", headers, body: JSON.stringify({ model: process.env.AI_MODEL, temperature: Number(process.env.AI_TEMPERATURE || 0.72), max_tokens: Number(process.env.AI_MAX_TOKENS || 180), messages: [{ role: "system", content: system }, { role: "user", content: context }] }), signal: controller.signal });
      return compactText(payload?.choices?.[0]?.message?.content, 600) || null;
    } catch (error) {
      const shouldFallback = mode === "auto" && /not supported|responses|chat completions|endpoint/i.test(error.message || "");
      if (!shouldFallback) throw error;
      const payload = await requestJson(`${baseUrl}/responses`, { method: "POST", headers, body: JSON.stringify({ model: process.env.AI_MODEL, instructions: system, input: context, temperature: Number(process.env.AI_TEMPERATURE || 0.72), max_output_tokens: Number(process.env.AI_MAX_TOKENS || 180) }), signal: controller.signal });
      return compactText(responseText(payload), 600) || null;
    }
  } finally {
    clearTimeout(timeout);
  }
}
