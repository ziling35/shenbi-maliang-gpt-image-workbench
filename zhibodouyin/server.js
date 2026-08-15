import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadEnv, envBoolean, envNumber } from "./lib/env.js";
import { aiStatus, generateDirectorText } from "./lib/ai.js";
import { normalizeDouyinEvent, shouldAskAi } from "./lib/events.js";
import { listTtsVoices, synthesizeSpeech, ttsStatus } from "./lib/tts.js";
import { createConfigStore } from "./lib/configStore.js";
import { createDouyinBridge } from "./lib/douyinBridge.js";
import { createRequestLogger } from "./lib/requestLog.js";

const root = path.dirname(fileURLToPath(import.meta.url));
loadEnv(root);
const configStore = createConfigStore(root);
const requestLogger = createRequestLogger(root);
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT || 8790);
const clients = new Set();
const events = [];
const aiCooldownByUser = new Map();
const aiWelcomedUsers = new Set();
const ttsRequestsByAddress = new Map();
const recentEventFingerprints = new Map();
const aiReplyInFlight = new Set();
const aiReplyCompleted = new Map();
let lastAiReplyAt = 0;
let lastSceneAiAt = 0;
let sceneGenerationQueue = Promise.resolve();
let lastLiveStateAiAt = 0;
let lastAiWelcomeAt = 0;
let lastDemoActionAt = 0;
let lastLivePageHeartbeatAt = 0;
let douyinBridgeStatus = {};
const directorScenes = {
  portraitEdit: "正在展示灵图AI的对话改图：上传人物图片后，直接用自然语言修改造型、发型、边缘和细节，并可选择生图模型、比例、清晰度和数量",
  emotionPortrait: "正在展示灵图AI的人像情绪强化：保留人物特征，增强眼神、泪痕、花瓣、光影和皮肤发丝细节，适合写真与内容封面",
  compositionExpand: "正在展示灵图AI的构图扩展：保留主体与原风格，补足环境、留白和画面比例，让素材适配海报、竖版封面与不同平台",
  wuxiaRestyle: "正在展示灵图AI的国风武侠改造：保留人物五官辨识度，重构服装、发型、道具与水墨场景，降低角色定妆制作成本",
  styleExtension: "正在展示灵图AI的参考风格延展：延续原图色彩、材质、灯光与世界观，生成统一的系列视觉内容",
  outfitChange: "正在展示灵图AI的模特换装：保留人物和场景，通过一句话更换服装，并使用提示词优化模型改善指令",
  quality4k: "正在展示灵图AI的高清生图参数：同一工作台可选择模型、画面比例、1K、2K、4K质量档位和生成数量，并显示预计费用",
  productDetail: "正在展示灵图AI的电商商品详情图：一次生成多张商品信息图、包装展示和营销素材，适合电商商家和设计人员",
  localEdit: "正在展示灵图AI的局部涂抹编辑：在图片上选中区域，用一句话指定修改内容，其余区域尽量保持不变",
  gallery: "正在展示灵图AI的我的图片：所有生成和编辑结果集中保存，支持按时间浏览、收藏、下载、批量管理和继续编辑",
  promptSystem: "正在展示灵图AI的创作提示词系统：按海报、产品宣传图、UI设计、人像写真等场景填写表单，并可选择不同文字模型优化提示词"
};
function liveAudienceConnected() {
  return Date.now() - lastLivePageHeartbeatAt < 15000;
}
function cooldownMs(name, fallback, minimum) {
  const configured = envNumber(name, fallback);
  const milliseconds = configured > 0 && configured < 1000 ? configured * 1000 : configured;
  return Math.max(minimum, milliseconds);
}
function logRequest(entry) { return requestLogger.write(entry); }
function eventFingerprint(event) {
  const explicitId = String(event?.eventId || event?.messageId || event?.msgId || "").trim();
  if (explicitId) return "id:" + explicitId;
  const text = String(event?.rawText || event?.text || "").trim().toLowerCase();
  const at = Number(event?.at || 0);
  const timeBucket = at > 0 ? Math.floor(at / 5000) : Math.floor(Date.now() / 8000);
  return [event?.type || "", event?.user || "", text, timeBucket].join("|");
}
function duplicateEvent(event) {
  const now = Date.now();
  for (const [key, expiresAt] of recentEventFingerprints) if (expiresAt <= now) recentEventFingerprints.delete(key);
  for (const [key, expiresAt] of aiReplyCompleted) if (expiresAt <= now) aiReplyCompleted.delete(key);
  const key = eventFingerprint(event);
  const ttl = event?.type === "chat" ? 30000 : 10000;
  if (recentEventFingerprints.has(key)) return true;
  recentEventFingerprints.set(key, now + ttl);
  return false;
}

function timedRequest(type, details = {}) { const startedAt = Date.now(); return { finish(extra = {}) { return logRequest({ type, durationMs: Date.now() - startedAt, details, ...extra }); } }; }
function queueSceneGeneration(task) {
  const queuedAt = Date.now();
  const queued = sceneGenerationQueue.catch(() => undefined).then(async () => {
    const minimumGap = cooldownMs("AI_SCENE_COOLDOWN_MS", 900, 350);
    const waitMs = Math.max(0, minimumGap - (Date.now() - lastSceneAiAt));
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
    lastSceneAiAt = Date.now();
    return task({ queueWaitMs: Date.now() - queuedAt });
  });
  sceneGenerationQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

function publicConfig() {
  return {
    title: process.env.PUBLIC_TITLE || "灵图AI",
    subtitle: process.env.PUBLIC_SUBTITLE || "AI 图片创作工作台",
    platformUrl: process.env.PLATFORM_URL || "https://lm.ziling.site/",
    platformDemoUrl: process.env.PLATFORM_DEMO_URL || process.env.PLATFORM_URL || "https://img.ziling.site/",
    platformDemoMode: process.env.PLATFORM_DEMO_MODE || "real",
    groupUrl: process.env.GROUP_URL || "https://qm.qq.com/your-group-link",
    groupLabel: process.env.GROUP_LABEL || "领取使用教程",
    tts: ttsStatus(), ai: aiStatus(), autoReply: envBoolean("AI_AUTO_REPLY", true), liveAudienceConnected: liveAudienceConnected()
  };
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
  res.end(body);
}
function broadcast(eventName, payload) {
  const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of [...clients]) {
    try { client.write(frame); } catch { clients.delete(client); }
  }
}
function addEvent(input) {
  const normalized = normalizeDouyinEvent(input);
  if (!normalized) return null;
  if (duplicateEvent(normalized)) { logRequest({ type: "event.duplicate", message: "忽略重复直播事件", details: { eventType: normalized.type, user: normalized.user, text: normalized.rawText || normalized.text } }); return null; }
  const item = { id: crypto.randomUUID(), ...normalized };
  events.push(item);
  while (events.length > 150) events.shift();
  broadcast("live-event", item);
  if (item.type === "chat") broadcast("comment", item);
  const demoAction = demoActionForEvent(item);
  if (demoAction) broadcast("demo-action", demoAction);
  void maybeGenerateReply(item);
  void maybeGenerateWelcome(item);
  return item;
}
function demoActionForEvent(event) {
  if (event?.type !== "chat") return null;
  const text = String(event.rawText || event.text || "");
  const now = Date.now();
  if (now - lastDemoActionAt < 8000) return null;
  let sceneKey = "";
  if (/作品|历史|保存|下载|收藏|素材|图片管理|生成记录/i.test(text)) sceneKey = "gallery";
  else if (/提示词|文案|海报|表单|优化指令|不会写词/i.test(text)) sceneKey = "promptSystem";
  else if (/局部|涂抹|蒙版|选区|只改这里/i.test(text)) sceneKey = "localEdit";
  else if (/商品|电商|详情图|包装|产品图/i.test(text)) sceneKey = "productDetail";
  else if (/4k|2k|1k|高清|清晰度|分辨率|质量|尺寸/i.test(text)) sceneKey = "quality4k";
  else if (/换装|衣服|服装|模特|穿搭/i.test(text)) sceneKey = "outfitChange";
  else if (/生图|生成图|画图|模型|比例|续改|修改图片|参考图|改图/i.test(text)) sceneKey = "portraitEdit";
  if (!sceneKey) return null;
  lastDemoActionAt = now;
  return { sceneKey, source: "comment", user: event.user, text: event.rawText || event.text, at: now };
}
const douyinBridge = createDouyinBridge({ onEvent: addEvent, onStatus: value => { douyinBridgeStatus = value; broadcast("douyin-bridge-status", value); } });
function canGenerateAiReply(event) {
  if (!liveAudienceConnected() || !envBoolean("AI_AUTO_REPLY", true) || !aiStatus().enabled || !shouldAskAi(event)) return false;
  const now = Date.now();
  const globalCooldown = cooldownMs("AI_REPLY_COOLDOWN_MS", 18000, 5000);
  const userCooldown = cooldownMs("AI_USER_COOLDOWN_MS", 90000, 15000);
  if (now - lastAiReplyAt < globalCooldown) return false;
  const replyKey = eventFingerprint(event);
  if (aiReplyInFlight.has(replyKey) || aiReplyCompleted.has(replyKey)) return false;
  if (now - (aiCooldownByUser.get(event.user) || 0) < userCooldown) return false;
  aiReplyInFlight.add(replyKey);
  lastAiReplyAt = now;
  aiCooldownByUser.set(event.user, now);
  return true;
}
async function maybeGenerateReply(event) {
  if (!canGenerateAiReply(event)) return;
  try {
    const timer = timedRequest("ai.reply", { user: event.user, text: event.rawText || event.text });
    const text = await generateDirectorText({ kind: "回答直播间观众问题", user: event.user, text: event.rawText || event.text, scene: "正在展示灵图AI的图片创作功能", recent: events.filter(item => item.type === "chat").slice(-5) });
    timer.finish({ ok: Boolean(text), provider: aiStatus().provider, model: aiStatus().model, message: text ? "弹幕回复已生成" : "模型未返回内容" });
    if (text) { broadcast("director", { id: crypto.randomUUID(), kind: "reply", user: event.user, text, at: Date.now() }); aiReplyCompleted.set(eventFingerprint(event), Date.now() + 120000); }
  } catch (error) {
    logRequest({ type: "ai.reply", ok: false, provider: aiStatus().provider, model: aiStatus().model, error: error?.message || error, details: { user: event.user, text: event.rawText || event.text } });
    console.warn("AI 弹幕回复生成失败", error?.message || error);
  } finally { aiReplyInFlight.delete(eventFingerprint(event)); }
}
function welcomeText(user) {
  const name = String(user || "新来的朋友").replace(/[，。！？,.!?\s]+/g, "").slice(0, 12) || "新来的朋友";
  const templates = [
    `欢迎${name}来到灵图AI直播间，平台目前免费试用，关注后就可以领取体验入口。`,
    `${name}欢迎你，灵图AI可以完成生图、连续改图和电商素材，二K两分钱，四K九分钱。`,
    `欢迎${name}，屏幕正在展示真实案例，关注后可以免费试用完整创作流程。`,
    `${name}来了，欢迎来到灵图AI，这里会重点介绍平台解决的场景问题和低成本优势。`
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}
function maybeGenerateWelcome(event) {
  if (!liveAudienceConnected() || event.type !== "member" || !envBoolean("AI_WELCOME_ENABLED", true) || aiWelcomedUsers.has(event.user)) return;
  const now = Date.now();
  if (now - lastAiWelcomeAt < cooldownMs("AI_WELCOME_COOLDOWN_MS", 12000, 5000)) return;
  aiWelcomedUsers.add(event.user);
  lastAiWelcomeAt = now;
  const text = welcomeText(event.user);
  logRequest({ type: "welcome.template", ok: true, message: "本地欢迎语已生成", details: { user: event.user } });
  broadcast("director", { id: crypto.randomUUID(), kind: "welcome", user: event.user, text, at: now });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; if (raw.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); } });
    req.on("error", reject);
  });
}
function safeFile(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
  const file = path.normalize(path.join(publicDir, relative));
  return file.startsWith(publicDir) ? file : null;
}
function authorized(req, tokenName) {
  const expected = process.env[tokenName];
  if (!expected) return true;
  return req.headers.authorization === `Bearer ${expected}` || req.headers["x-webhook-token"] === expected || req.headers["x-admin-token"] === expected;
}
function adminToken(req) {
  return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "") || String(req.headers["x-admin-token"] || "");
}
function adminAuthorized(req) {
  const expected = process.env.ADMIN_TOKEN || "";
  const supplied = adminToken(req);
  if (!expected || !supplied || expected.length !== supplied.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}
async function testAdminService(body) {
  const service = String(body.service || "");
  if (service === "tts") {
    const result = await synthesizeSpeech(body.text || "灵图AI语音配置测试。", body.provider);
    return { ok: true, service, provider: result.provider, browser: Boolean(result.browser), bytes: result.buffer?.length || 0 };
  }
  if (service === "ai") {
    const text = await generateDirectorText({ kind: "后台配置连通性测试", scene: "请用一句简短自然的话介绍灵图AI" });
    if (!text) throw new Error("大模型尚未配置完整");
    return { ok: true, service, text };
  }
  throw new Error("未知测试类型");
}
function audio(res, result) {
  res.writeHead(200, {
    "Content-Type": result.contentType,
    "Content-Length": result.buffer.length,
    "Cache-Control": "no-store",
    "X-TTS-Provider": result.provider,
    "Access-Control-Allow-Origin": "*"
  });
  res.end(result.buffer);
}
function allowTtsRequest(req) {
  const address = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const windowMs = envNumber("TTS_RATE_WINDOW_MS", 60000);
  const limit = envNumber("TTS_RATE_LIMIT", 30);
  const recent = (ttsRequestsByAddress.get(address) || []).filter(at => now - at < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  ttsRequestsByAddress.set(address, recent);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Webhook-Token, X-Admin-Token", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" });
    return res.end();
  }
  if (url.pathname === "/api/config") return json(res, 200, publicConfig());
  if (url.pathname === "/api/admin/session" && req.method === "POST") {
    return adminAuthorized(req) ? json(res, 200, { ok: true }) : json(res, 401, { error: "管理员令牌错误" });
  }
  if (url.pathname === "/api/admin/config" && req.method === "GET") {
    if (!adminAuthorized(req)) return json(res, 401, { error: "未授权" });
    return json(res, 200, { ...configStore.snapshot(), status: { public: publicConfig() } });
  }
  if (url.pathname === "/api/admin/config" && req.method === "PUT") {
    if (!adminAuthorized(req)) return json(res, 401, { error: "未授权" });
    try {
      const snapshot = configStore.update(await readBody(req));
      douyinBridge.connect();
      broadcast("config-updated", publicConfig());
      return json(res, 200, { ok: true, ...snapshot, status: { public: publicConfig() } });
    } catch (error) {
      console.warn("后台配置保存失败", error?.message || error);
      return json(res, 400, { error: error?.message || "配置保存失败" });
    }
  }
  if (url.pathname === "/api/admin/douyin/token" && req.method === "POST") {
    if (!adminAuthorized(req)) return json(res, 401, { error: "未授权" });
    const token = configStore.regenerateWebhookToken();
    return json(res, 200, { ok: true, token, ...configStore.snapshot() });
  }
  if (url.pathname === "/api/admin/douyin/status" && req.method === "GET") {
    if (!adminAuthorized(req)) return json(res, 401, { error: "未授权" });
    return json(res, 200, { ok: true, bridge: douyinBridge.snapshot() });
  }
  if (url.pathname === "/api/admin/douyin/test-event" && req.method === "POST") {
    if (!adminAuthorized(req)) return json(res, 401, { error: "未授权" });
    const event = addEvent({ type: "chat", user_name: "测试观众", content: "灵图AI弹幕接入测试成功" });
    return json(res, 200, { ok: true, event });
  }
  if (url.pathname === "/api/admin/test" && req.method === "POST") {
    if (!adminAuthorized(req)) return json(res, 401, { error: "未授权" });
    try { return json(res, 200, await testAdminService(await readBody(req))); }
    catch (error) { return json(res, 502, { error: error?.message || "测试失败" }); }
  }
  if (url.pathname === "/api/admin/tts-preview" && req.method === "POST") {
    if (!adminAuthorized(req)) return json(res, 401, { error: "未授权" });
    let body = {};
    try {
      body = await readBody(req);
      const timer = timedRequest("tts.preview", { provider: body.provider, text: body.text });
      const result = await synthesizeSpeech(body.text || "灵图AI语音配置测试，欢迎来到直播间。", body.provider);
      timer.finish({ provider: result.provider, ok: !result.browser, message: result.browser ? "浏览器语音无需服务端合成" : "试听音频已生成" });
      if (result.browser) return json(res, 400, { error: "浏览器语音请在直播页试听" });
      return audio(res, result);
    } catch (error) {
      logRequest({ type: "tts.preview", ok: false, provider: body?.provider, error: error?.message || error });
      return json(res, 502, { error: error?.message || "语音试听失败" });
    }
  }
  if (url.pathname === "/api/admin/tts-voices" && req.method === "GET") {
    if (!adminAuthorized(req)) return json(res, 401, { error: "未授权" });
    try {
      const provider = String(url.searchParams.get("provider") || "").trim();
      const model = String(url.searchParams.get("model") || "").trim();
      const timer = timedRequest("tts.voices", { provider, model });
      const voices = await listTtsVoices(provider, model);
      timer.finish({ provider, ok: true, message: `读取到 ${voices.length} 个音色` });
      return json(res, 200, { ok: true, provider, voices });
    } catch (error) {
      logRequest({ type: "tts.voices", ok: false, provider: url.searchParams.get("provider"), error: error?.message || error });
      return json(res, 502, { error: error?.message || "音色列表读取失败" });
    }
  }
  if (url.pathname === "/api/admin/logs" && req.method === "GET") {
    if (!adminAuthorized(req)) return json(res, 401, { error: "未授权" });
    const okParam = url.searchParams.get("ok");
    const ok = okParam === null ? undefined : okParam === "true";
    return json(res, 200, { ok: true, stats: requestLogger.stats(), logs: requestLogger.read({ limit: url.searchParams.get("limit"), ok, type: url.searchParams.get("type") || "" }) });
  }
  if (url.pathname === "/api/admin/logs" && req.method === "DELETE") {
    if (!adminAuthorized(req)) return json(res, 401, { error: "未授权" });
    requestLogger.clear();
    logRequest({ type: "admin.logs.clear", message: "管理员清空请求日志" });
    return json(res, 200, { ok: true, stats: requestLogger.stats() });
  }
  if (url.pathname === "/api/client-log" && req.method === "POST") {
    try {
      const body = await readBody(req);
      logRequest({ type: body.type || "client.error", ok: body.ok !== false, level: body.level, message: body.message, error: body.error, details: body.details });
      return json(res, 200, { ok: true });
    } catch { return json(res, 400, { error: "请求格式错误" }); }
  }
  if (url.pathname === "/api/events/history" && req.method === "GET") return json(res, 200, events.slice(-40));
  if (url.pathname === "/api/comments" && req.method === "GET") return json(res, 200, events.filter(item => item.type === "chat").slice(-30));
  if (url.pathname === "/api/live-presence" && req.method === "POST") {
    try {
      const body = await readBody(req);
      lastLivePageHeartbeatAt = body.visible === false ? 0 : Date.now();
      return json(res, 200, { ok: true, active: liveAudienceConnected() });
    } catch {
      return json(res, 400, { error: "请求格式错误" });
    }
  }
  if (url.pathname === "/api/events" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "Access-Control-Allow-Origin": "*" });
    res.write(`event: ready\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
    clients.add(res);
    const heartbeat = setInterval(() => { try { res.write(`: ping ${Date.now()}\n\n`); } catch {} }, 20000);
    req.on("close", () => { clearInterval(heartbeat); clients.delete(res); });
    return;
  }
  if (url.pathname === "/api/tts" && req.method === "POST") {
    if (!allowTtsRequest(req)) { logRequest({ type: "tts.synthesize", ok: false, error: "语音请求过于频繁", details: { remoteAddress: req.socket.remoteAddress || "unknown" } }); return json(res, 429, { error: "语音请求过于频繁，请稍后再试", fallback: "browser" }); }
    try {
      const body = await readBody(req);
      const timer = timedRequest("tts.synthesize", { provider: body.provider, textLength: String(body.text || "").length });
      const result = await synthesizeSpeech(body.text, body.provider);
      timer.finish({ provider: result.provider, ok: !result.browser, message: result.browser ? "浏览器语音回退" : "音频已生成" });
      if (result.browser) return json(res, 200, { browser: true, provider: result.provider });
      return audio(res, result);
    } catch (error) {
      logRequest({ type: "tts.synthesize", ok: false, error: error?.message || error });
      console.warn("TTS 合成失败", error?.message || error);
      return json(res, 502, { error: error?.message || "语音合成失败", fallback: "browser" });
    }
  }
  if (url.pathname === "/api/director/generate" && req.method === "POST") {
    if (!authorized(req, "ADMIN_TOKEN")) return json(res, 401, { error: "未授权" });
    try {
      const body = await readBody(req);
      const text = await generateDirectorText({ kind: body.kind || "生成直播讲解", user: body.user, text: body.text, scene: body.scene, recent: events.filter(item => item.type === "chat").slice(-5) });
      if (!text) return json(res, 503, { error: "大模型尚未配置" });
      if (body.broadcast !== false) broadcast("director", { id: crypto.randomUUID(), kind: body.kind || "narration", user: body.user || "", text, at: Date.now() });
      return json(res, 200, { ok: true, text });
    } catch (error) {
      console.warn("AI 导播文案生成失败", error?.message || error);
      return json(res, 502, { error: error?.message || "大模型调用失败" });
    }
  }
  if (url.pathname === "/api/director/scene" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const sceneKey = String(body.sceneKey || "");
      const scene = directorScenes[sceneKey];
      if (!scene) return json(res, 400, { error: "未知演示场景" });
      if (!aiStatus().enabled) return json(res, 200, { ok: true, text: null, fallback: true });
      const nextScene = directorScenes[String(body.nextSceneKey || "")] || "下一个灵图AI功能场景";
      const cycle = Math.max(1, Number(body.cycle || 1));
      const kind = `生成直播主讲稿。当前是第${cycle}轮演示。请围绕当前画面连续讲5到8句，重点讲清灵图AI的功能优势、解决的实际问题、适合的用户与场景。自然说明平台当前免费试用，2K每张0.02元，4K每张0.09元，并引导观众先关注再领取试用入口。不要询问观众想看什么，不要要求发弹幕点播。最后自然预告下一个画面。不要使用列表、标题或Markdown，不要承诺收益，不要连续重复同一句引导。下一画面：${nextScene}`;
      const timer = timedRequest("ai.scene", { sceneKey, nextSceneKey: body.nextSceneKey, cycle });
      const result = await queueSceneGeneration(async ({ queueWaitMs }) => ({
        text: await generateDirectorText({ kind, scene, recent: events.filter(item => item.type === "chat").slice(-4) }),
        queueWaitMs
      }));
      const text = result.text;
      timer.finish({ ok: Boolean(text), provider: aiStatus().provider, model: aiStatus().model, message: text ? "场景讲稿已生成" : "模型未返回内容", details: { queueWaitMs: result.queueWaitMs } });
      return json(res, 200, { ok: true, text });
    } catch (error) {
      logRequest({ type: "ai.scene", ok: false, provider: aiStatus().provider, model: aiStatus().model, error: error?.message || error });
      console.warn("AI 场景讲解生成失败", error?.message || error);
      return json(res, 502, { error: error?.message || "大模型调用失败" });
    }
  }
  if (url.pathname === "/api/director/live-state" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const now = Date.now();
      if (now - lastLiveStateAiAt < 900) return json(res, 429, { error: "实机讲解生成过于频繁" });
      lastLiveStateAiAt = now;
      const phase = String(body.phase || "waiting");
      const prompt = String(body.prompt || "").slice(0, 500);
      const completed = Math.max(0, Number(body.completed || 0));
      const expected = Math.max(1, Number(body.expected || 1));
      const scene = [
        `当前正在灵图AI真实操作页面进行直播演示。`,
        prompt ? `当前实际提示词：${prompt}` : "",
        `当前任务阶段：${phase}。`,
        `图片进度：${completed}/${expected}。`,
        body.latestImage ? "页面已经出现最新生成结果，可以围绕下一步修改进行讲解，但不要声称看到了未提供的具体画面细节。" : "图片尚未返回，继续解释当前工作流、参数价值和适用场景。"
      ].filter(Boolean).join("\n");
      const instructions = phase === "result"
        ? "生成2到4句自然口播：先告诉观众真实结果已经出现，再说明连续改图解决了哪些返工问题，并自然引导关注后免费试用。不要虚构图片具体内容，不要提问。"
        : phase === "editing"
          ? "生成2到4句自然口播：说明正在对刚才的真实结果继续修改，解释连续改图怎样减少返工，并自然提到平台当前免费试用。不要提问。"
          : "生成3到5句等待期间的自然口播：结合当前提示词解释创作思路、参数、适用场景和成本优势，提醒这是后台真实生成，并自然说明2K两分钱、4K九分钱或关注后免费试用。不要提问，不要重复上一段。";
      const text = await generateDirectorText({ kind: instructions, scene, recent: events.filter(item => item.type === "chat").slice(-5) });
      if (!text) return json(res, 200, { ok: true, text: null, fallback: true });
      logRequest({ type: "ai.live-state", ok: true, provider: aiStatus().provider, model: aiStatus().model, details: { phase, completed, expected } });
      return json(res, 200, { ok: true, text });
    } catch (error) {
      logRequest({ type: "ai.live-state", ok: false, provider: aiStatus().provider, model: aiStatus().model, error: error?.message || error });
      return json(res, 502, { error: error?.message || "实机讲解生成失败" });
    }
  }
  if (url.pathname === "/api/comments" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const normalized = normalizeDouyinEvent({ type: "chat", ...body });
      if (!normalized) return json(res, 400, { error: "评论内容为空" });
      const item = addEvent({ type: "chat", ...body });
      return item ? json(res, 200, { ok: true, event: item }) : json(res, 200, { ok: true, duplicate: true, ignored: true });
    } catch { return json(res, 400, { error: "请求格式错误" }); }
  }
  if (url.pathname === "/api/douyin/events" && req.method === "POST" || url.pathname === "/api/douyin/comments" && req.method === "POST") {
    if (!authorized(req, "DOUYIN_WEBHOOK_TOKEN")) return json(res, 401, { error: "未授权" });
    try {
      const body = await readBody(req);
      const data = Array.isArray(body) ? body : Array.isArray(body.events) ? body.events : Array.isArray(body.comments) ? body.comments : Array.isArray(body.data) ? body.data : [body];
      const accepted = data.map(addEvent).filter(Boolean);
      return json(res, 200, { ok: true, accepted: accepted.length, types: [...new Set(accepted.map(item => item.type))] });
    } catch { return json(res, 400, { error: "请求格式错误" }); }
  }
  if (url.pathname === "/healthz") return json(res, 200, { ok: true, brand: publicConfig().title, tts: ttsStatus(), ai: aiStatus(), liveAudienceConnected: liveAudienceConnected(), liveAudienceCount: clients.size, lastLivePageHeartbeatAt });
  const file = safeFile(req.url || "/");
  if (!file) return json(res, 403, { error: "forbidden" });
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) return json(res, 404, { error: "not found" });
    const ext = path.extname(file);
    const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg" };
    res.writeHead(200, { "Content-Type": `${types[ext] || "application/octet-stream"}; charset=utf-8`, "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600" });
    fs.createReadStream(file).pipe(res);
  });
});
server.listen(port, "0.0.0.0", () => { console.log(`灵图AI直播智能导播：http://0.0.0.0:${port}`); douyinBridge.connect(); });
