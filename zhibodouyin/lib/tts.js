import crypto from "node:crypto";

function cleanText(value, max = 300) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}
function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function ttsStatus() {
  const providers = {
    volcengine: Boolean(process.env.VOLC_TTS_APP_ID && process.env.VOLC_TTS_ACCESS_TOKEN),
    tencent: Boolean(process.env.TENCENT_TTS_SECRET_ID && process.env.TENCENT_TTS_SECRET_KEY),
    aliyun: Boolean(process.env.ALIYUN_TTS_APP_KEY && process.env.ALIYUN_TTS_TOKEN),
    stepfun: Boolean(process.env.STEPFUN_TTS_API_KEY),
    grok2api: Boolean(process.env.GROK_TTS_API_KEY),
    browser: true
  };
  const requested = String(process.env.TTS_PROVIDER || "browser").toLowerCase();
  const active = providers[requested] ? requested : "browser";
  return { active, providers, voice: voiceLabel(active) };
}

function voiceLabel(provider) {
  if (provider === "volcengine") return process.env.VOLC_TTS_VOICE_TYPE || "火山音色";
  if (provider === "tencent") return process.env.TENCENT_TTS_VOICE_TYPE || "腾讯音色";
  if (provider === "aliyun") return process.env.ALIYUN_TTS_VOICE || "阿里音色";
  if (provider === "stepfun") return process.env.STEPFUN_TTS_VOICE || "阶跃星辰音色";
  if (provider === "grok2api") return process.env.GROK_TTS_VOICE || "Grok Voice";
  return "浏览器中文语音";
}

function audioContentType(format) {
  return {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    flac: "audio/flac",
    opus: "audio/ogg",
    aac: "audio/aac",
    pcm: "application/octet-stream"
  }[String(format || "mp3").toLowerCase()] || "audio/mpeg";
}

function grokBaseUrl() {
  return String(process.env.GROK_TTS_BASE_URL || "http://grok2api.ziling.site/v1").replace(/\/+$/, "");
}

function grokEndpoint(pathname) {
  const base = grokBaseUrl();
  if (base.endsWith(pathname)) return base;
  return `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function grokError(response) {
  const payload = await response.json().catch(() => null);
  return payload?.error?.message || payload?.error || payload?.message || payload?.detail || `Grok2API TTS HTTP ${response.status}`;
}

function grokAudioFromJson(payload, format) {
  const encoded = payload?.audio || payload?.audio_base64 || payload?.data?.audio || payload?.data?.audio_base64 || payload?.data?.b64_json;
  if (!encoded || typeof encoded !== "string") return null;
  return { buffer: Buffer.from(encoded.replace(/^data:audio\/[^;]+;base64,/i, ""), "base64"), contentType: audioContentType(format) };
}

async function grok2api(text) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.GROK_TTS_TIMEOUT_MS || 60000));
  try {
    const format = String(process.env.GROK_TTS_RESPONSE_FORMAT || "mp3").toLowerCase();
    const mode = String(process.env.GROK_TTS_API_MODE || "openai").toLowerCase();
    const model = process.env.GROK_TTS_MODEL || "grok-voice-think-fast-1.0";
    const voice = process.env.GROK_TTS_VOICE || "eve";
    const language = process.env.GROK_TTS_LANGUAGE || "zh";
    const speed = Number(process.env.GROK_TTS_SPEED || 1);
    const nativeMode = mode === "native";
    const outputFormat = { codec: format };
    const sampleRate = Number(process.env.GROK_TTS_SAMPLE_RATE || 0);
    const bitRate = Number(process.env.GROK_TTS_BIT_RATE || 0);
    if (sampleRate > 0) outputFormat.sample_rate = sampleRate;
    if (bitRate > 0) outputFormat.bit_rate = bitRate;
    const body = nativeMode
      ? { model, text, voice_id: voice, language, output_format: outputFormat, speed, with_timestamps: false }
      : { model, input: text, voice, response_format: format, speed, language };
    const response = await fetch(grokEndpoint(nativeMode ? "/tts" : "/audio/speech"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROK_TTS_API_KEY}` },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) throw new Error(await grokError(response));
    if (contentType.includes("json")) {
      const payload = await response.json().catch(() => null);
      const audio = grokAudioFromJson(payload, format);
      if (!audio) throw new Error(payload?.message || "Grok2API TTS 返回了 JSON，但未找到音频数据");
      return audio;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error("Grok2API TTS 未返回音频");
    return { buffer, contentType: contentType || audioContentType(format) };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Grok2API TTS 请求超时");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeVoiceItems(payload) {
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.voices) ? payload.voices : Array.isArray(payload?.data) ? payload.data : [];
  const seen = new Set();
  return list.flatMap(item => {
    const record = typeof item === "string" ? { id: item, name: item } : item || {};
    const id = String(record.voice_id || record.id || record.value || record.name || "").trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: String(record.display_name || record.displayName || record.label || record.name || id).trim() || id }];
  });
}

export async function listTtsVoices(provider, model) {
  if (provider !== "grok2api") return [];
  if (!process.env.GROK_TTS_API_KEY) throw new Error("请先配置 Grok2API API Key");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.GROK_TTS_TIMEOUT_MS || 60000));
  try {
    const voiceModel = String(model || process.env.GROK_TTS_MODEL || "grok-voice-think-fast-1.0").trim();
    const endpoint = new URL(grokEndpoint("/tts/voices"));
    if (voiceModel) endpoint.searchParams.set("model", voiceModel);
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${process.env.GROK_TTS_API_KEY}`, Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(await grokError(response));
    const voices = normalizeVoiceItems(await response.json().catch(() => null));
    if (!voices.length) throw new Error("Grok2API 未返回可用音色");
    return voices;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Grok2API 音色列表请求超时");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function volcengine(text) {
  const response = await fetch(process.env.VOLC_TTS_ENDPOINT || "https://openspeech.bytedance.com/api/v1/tts", {
    method: "POST",
    headers: { Authorization: `Bearer; ${process.env.VOLC_TTS_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      app: { appid: process.env.VOLC_TTS_APP_ID, token: process.env.VOLC_TTS_ACCESS_TOKEN, cluster: process.env.VOLC_TTS_CLUSTER || "volcano_tts" },
      user: { uid: process.env.VOLC_TTS_UID || "lingtu-live" },
      audio: { voice_type: process.env.VOLC_TTS_VOICE_TYPE || "zh_female_cancan_mars_bigtts", encoding: "mp3", speed_ratio: Number(process.env.VOLC_TTS_SPEED || 1), volume_ratio: Number(process.env.VOLC_TTS_VOLUME || 1), pitch_ratio: Number(process.env.VOLC_TTS_PITCH || 1) },
      request: { reqid: crypto.randomUUID(), text, text_type: "plain", operation: "query" }
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(payload?.message || `火山 TTS HTTP ${response.status}`);
  if (payload.code && payload.code !== 3000) throw new Error(payload.message || `火山 TTS 错误 ${payload.code}`);
  const base64 = payload.data || payload.audio;
  if (!base64) throw new Error("火山 TTS 未返回音频");
  return { buffer: Buffer.from(base64, "base64"), contentType: "audio/mpeg" };
}

async function aliyun(text) {
  const endpoint = process.env.ALIYUN_TTS_ENDPOINT || "https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/tts";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-NLS-Token": process.env.ALIYUN_TTS_TOKEN },
    body: JSON.stringify({ appkey: process.env.ALIYUN_TTS_APP_KEY, token: process.env.ALIYUN_TTS_TOKEN, text, format: "mp3", sample_rate: Number(process.env.ALIYUN_TTS_SAMPLE_RATE || 16000), voice: process.env.ALIYUN_TTS_VOICE || "xiaoyun", volume: Number(process.env.ALIYUN_TTS_VOLUME || 65), speech_rate: Number(process.env.ALIYUN_TTS_SPEECH_RATE || -30), pitch_rate: Number(process.env.ALIYUN_TTS_PITCH_RATE || 0) })
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || contentType.includes("json")) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `阿里云 TTS HTTP ${response.status}`);
  }
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType: contentType || "audio/mpeg" };
}

async function tencent(text) {
  const host = "tts.tencentcloudapi.com";
  const service = "tts";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payload = JSON.stringify({ Text: text, SessionId: crypto.randomUUID(), VoiceType: Number(process.env.TENCENT_TTS_VOICE_TYPE || 101001), Codec: "mp3", SampleRate: Number(process.env.TENCENT_TTS_SAMPLE_RATE || 16000), Speed: Number(process.env.TENCENT_TTS_SPEED || 0), Volume: Number(process.env.TENCENT_TTS_VOLUME || 0), EmotionCategory: process.env.TENCENT_TTS_EMOTION || "neutral" });
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:texttovoice\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256(payload)}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256(canonicalRequest)}`;
  const secretDate = hmac(`TC3${process.env.TENCENT_TTS_SECRET_KEY}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = hmac(secretSigning, stringToSign, "hex");
  const authorization = `TC3-HMAC-SHA256 Credential=${process.env.TENCENT_TTS_SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetch(`https://${host}`, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json; charset=utf-8", Host: host, "X-TC-Action": "TextToVoice", "X-TC-Version": "2019-08-23", "X-TC-Timestamp": String(timestamp), ...(process.env.TENCENT_TTS_REGION ? { "X-TC-Region": process.env.TENCENT_TTS_REGION } : {}) },
    body: payload
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.Response?.Error) throw new Error(result.Response?.Error?.Message || `腾讯云 TTS HTTP ${response.status}`);
  if (!result.Response?.Audio) throw new Error("腾讯云 TTS 未返回音频");
  return { buffer: Buffer.from(result.Response.Audio, "base64"), contentType: "audio/mpeg" };
}

function stepfunEndpoint() {
  const value = String(process.env.STEPFUN_TTS_BASE_URL || "https://api.stepfun.com/step_plan/v1").replace(/\/$/, "");
  return value.endsWith("/audio/speech") ? value : `${value}/audio/speech`;
}

async function stepfun(text) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.STEPFUN_TTS_TIMEOUT_MS || 60000));
  try {
    const format = String(process.env.STEPFUN_TTS_RESPONSE_FORMAT || "mp3").toLowerCase();
    const model = process.env.STEPFUN_TTS_MODEL || "stepaudio-2.5-tts";
    const body = {
      model,
      input: text,
      voice: process.env.STEPFUN_TTS_VOICE || "cixingnansheng",
      response_format: format,
      speed: Number(process.env.STEPFUN_TTS_SPEED || 1),
      volume: Number(process.env.STEPFUN_TTS_VOLUME || 1)
    };
    const instruction = String(process.env.STEPFUN_TTS_INSTRUCTION || "").trim();
    if (instruction) body.instruction = instruction.slice(0, 200);
    const response = await fetch(stepfunEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.STEPFUN_TTS_API_KEY}` },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || contentType.includes("json")) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error?.message || payload?.message || `阶跃星辰 TTS HTTP ${response.status}`);
    }
    const contentTypes = { mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", opus: "audio/ogg", pcm: "application/octet-stream" };
    return { buffer: Buffer.from(await response.arrayBuffer()), contentType: contentType || contentTypes[format] || "audio/mpeg" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function synthesizeSpeech(inputText, requestedProvider) {
  const text = cleanText(inputText, Number(process.env.TTS_MAX_TEXT_LENGTH || 260));
  if (!text) throw new Error("播报文本为空");
  const status = ttsStatus();
  const provider = requestedProvider && status.providers[requestedProvider] ? requestedProvider : status.active;
  if (provider === "browser") return { provider, browser: true };
  const handlers = { volcengine, tencent, aliyun, stepfun, grok2api };
  const result = await handlers[provider](text);
  return { provider, ...result };
}
