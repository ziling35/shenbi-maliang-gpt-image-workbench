import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const editableKeys = [
  "PUBLIC_TITLE", "PUBLIC_SUBTITLE", "PLATFORM_URL", "PLATFORM_DEMO_URL", "PLATFORM_DEMO_MODE", "GROUP_URL", "GROUP_LABEL", "DOUYIN_WEBHOOK_TOKEN", "DOUYIN_ROOM_ID", "DOUYIN_LIVE_WS_BASE_URL", "DOUYIN_BRIDGE_ENABLED",
  "TTS_PROVIDER", "TTS_MAX_TEXT_LENGTH", "TTS_RATE_LIMIT", "TTS_RATE_WINDOW_MS",
  "VOLC_TTS_APP_ID", "VOLC_TTS_ACCESS_TOKEN", "VOLC_TTS_CLUSTER", "VOLC_TTS_VOICE_TYPE", "VOLC_TTS_SPEED", "VOLC_TTS_VOLUME", "VOLC_TTS_PITCH", "VOLC_TTS_ENDPOINT",
  "TENCENT_TTS_SECRET_ID", "TENCENT_TTS_SECRET_KEY", "TENCENT_TTS_REGION", "TENCENT_TTS_VOICE_TYPE", "TENCENT_TTS_SAMPLE_RATE", "TENCENT_TTS_SPEED", "TENCENT_TTS_VOLUME", "TENCENT_TTS_EMOTION",
  "ALIYUN_TTS_APP_KEY", "ALIYUN_TTS_TOKEN", "ALIYUN_TTS_VOICE", "ALIYUN_TTS_SAMPLE_RATE", "ALIYUN_TTS_VOLUME", "ALIYUN_TTS_SPEECH_RATE", "ALIYUN_TTS_PITCH_RATE", "ALIYUN_TTS_ENDPOINT",
  "STEPFUN_TTS_BASE_URL", "STEPFUN_TTS_API_KEY", "STEPFUN_TTS_MODEL", "STEPFUN_TTS_VOICE", "STEPFUN_TTS_INSTRUCTION", "STEPFUN_TTS_RESPONSE_FORMAT", "STEPFUN_TTS_SPEED", "STEPFUN_TTS_VOLUME", "STEPFUN_TTS_TIMEOUT_MS",
  "GROK_TTS_BASE_URL", "GROK_TTS_API_KEY", "GROK_TTS_API_MODE", "GROK_TTS_MODEL", "GROK_TTS_VOICE", "GROK_TTS_LANGUAGE", "GROK_TTS_RESPONSE_FORMAT", "GROK_TTS_SPEED", "GROK_TTS_SAMPLE_RATE", "GROK_TTS_BIT_RATE", "GROK_TTS_TIMEOUT_MS",
  "AI_PROVIDER_NAME", "AI_BASE_URL", "AI_API_KEY", "AI_MODEL", "AI_API_MODE", "AI_TEMPERATURE", "AI_MAX_TOKENS", "AI_TIMEOUT_MS", "AI_AUTO_REPLY", "AI_WELCOME_ENABLED", "AI_REPLY_COOLDOWN_MS", "AI_USER_COOLDOWN_MS", "AI_WELCOME_COOLDOWN_MS", "AI_SCENE_COOLDOWN_MS", "AI_SYSTEM_PROMPT"
];

const secretKeys = new Set([
  "DOUYIN_WEBHOOK_TOKEN", "VOLC_TTS_ACCESS_TOKEN", "TENCENT_TTS_SECRET_ID", "TENCENT_TTS_SECRET_KEY",
  "ALIYUN_TTS_APP_KEY", "ALIYUN_TTS_TOKEN", "STEPFUN_TTS_API_KEY", "GROK_TTS_API_KEY", "AI_API_KEY"
]);

export function createConfigStore(root) {
  const dataDir = path.join(root, "data");
  const configFile = path.join(dataDir, "live-config.json");
  const tokenFile = path.join(dataDir, "admin-token.txt");
  fs.mkdirSync(dataDir, { recursive: true });

  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(configFile, "utf8")); } catch {}

  for (const [key, value] of Object.entries(saved)) {
    if (editableKeys.includes(key) && value !== undefined && value !== null) process.env[key] = String(value);
  }

  if (!process.env.ADMIN_TOKEN) {
    try { process.env.ADMIN_TOKEN = fs.readFileSync(tokenFile, "utf8").trim(); } catch {}
  }
  if (!process.env.DOUYIN_WEBHOOK_TOKEN || process.env.DOUYIN_WEBHOOK_TOKEN === "change-this-webhook-token") {
    process.env.DOUYIN_WEBHOOK_TOKEN = crypto.randomBytes(32).toString("base64url");
    saved.DOUYIN_WEBHOOK_TOKEN = process.env.DOUYIN_WEBHOOK_TOKEN;
    fs.writeFileSync(configFile, `${JSON.stringify(saved, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }
  if (!process.env.ADMIN_TOKEN) {
    process.env.ADMIN_TOKEN = crypto.randomBytes(24).toString("base64url");
    fs.writeFileSync(tokenFile, process.env.ADMIN_TOKEN, { encoding: "utf8", mode: 0o600 });
  }

  function snapshot() {
    const values = {};
    const configuredSecrets = {};
    for (const key of editableKeys) {
      if (secretKeys.has(key)) {
        values[key] = "";
        configuredSecrets[key] = Boolean(process.env[key]);
      } else {
        values[key] = process.env[key] || "";
      }
    }
    return { values, configuredSecrets };
  }

  function update(input = {}) {
    const next = { ...saved };
    const clearSecrets = new Set(Array.isArray(input.clearSecrets) ? input.clearSecrets : []);
    for (const key of editableKeys) {
      if (!(key in input.values)) continue;
      const value = input.values[key];
      if (secretKeys.has(key) && (value === "" || value == null) && !clearSecrets.has(key)) continue;
      const normalized = value == null ? "" : String(value).trim();
      if (normalized) {
        next[key] = normalized;
        process.env[key] = normalized;
      } else {
        delete next[key];
        delete process.env[key];
      }
    }
    saved = next;
    const temporary = `${configFile}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(saved, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, configFile);
    return snapshot();
  }

  function regenerateWebhookToken() {
    const token = crypto.randomBytes(32).toString("base64url");
    saved = { ...saved, DOUYIN_WEBHOOK_TOKEN: token };
    process.env.DOUYIN_WEBHOOK_TOKEN = token;
    const temporary = `${configFile}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(saved, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, configFile);
    return token;
  }

  return { snapshot, update, regenerateWebhookToken, tokenFile, configFile, editableKeys, secretKeys };
}
