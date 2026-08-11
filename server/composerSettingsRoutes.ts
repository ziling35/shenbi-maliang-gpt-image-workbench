import type { Hono } from "hono";
import { requireUser } from "./auth";
import { appDb, getOne, run } from "./db";
import { now } from "./utils";

type ComposerSettingsRow = {
  user_id: string;
  session_id: string;
  provider_id: string;
  image_count: number;
  size: string;
  quality: string;
  prompt_optimizer_model: string;
  prompt_input_optimize_style: string;
  prompt_color_scheme_ids_json: string;
  prompt_color_scheme_injection: string;
  updated_at: string;
};

function scopeSessionId(value: unknown) {
  return String(value ?? "").trim().slice(0, 200);
}

function ownedSession(userId: string, sessionId: string) {
  if (!sessionId) return true;
  return Boolean(getOne<{ id: string }>(appDb, "select id from sessions where id = ? and user_id = ? and deleted_at is null", sessionId, userId));
}

function normalizeIds(value: unknown) {
  const raw = Array.isArray(value) ? value : [];
  return Array.from(new Set(raw.map((item) => String(item ?? "").trim()).filter(Boolean))).slice(0, 1);
}

function publicSettings(row: ComposerSettingsRow | null) {
  if (!row) return null;
  let promptColorSchemeIds: string[] = [];
  try {
    const parsed = JSON.parse(row.prompt_color_scheme_ids_json);
    promptColorSchemeIds = normalizeIds(parsed);
  } catch {
    promptColorSchemeIds = [];
  }
  return {
    providerId: row.provider_id,
    imageCount: Math.max(1, Math.min(10, Math.trunc(Number(row.image_count) || 1))),
    size: row.size,
    quality: row.quality,
    promptOptimizerModel: row.prompt_optimizer_model || "system",
    promptInputOptimizeStyle: row.prompt_input_optimize_style || "standard",
    promptColorSchemeIds,
    promptColorSchemeInjection: row.prompt_color_scheme_injection,
    updatedAt: row.updated_at
  };
}

export function registerComposerSettingsRoutes(api: Hono) {
  api.get("/composer-settings", async (c) => {
    const user = await requireUser(c);
    if (!user) return c.json({ error: "未登录" }, 401);
    const sessionId = scopeSessionId(c.req.query("sessionId"));
    if (!ownedSession(user.id, sessionId)) return c.json({ error: "对话不存在" }, 404);
    const row = getOne<ComposerSettingsRow>(
      appDb,
      "select * from composer_settings where user_id = ? and session_id = ?",
      user.id,
      sessionId
    );
    return c.json({ settings: publicSettings(row) });
  });

  api.put("/composer-settings", async (c) => {
    const user = await requireUser(c);
    if (!user) return c.json({ error: "未登录" }, 401);
    const body = await c.req.json().catch(() => ({}));
    const sessionId = scopeSessionId(body.sessionId);
    if (!ownedSession(user.id, sessionId)) return c.json({ error: "对话不存在" }, 404);
    const input = body.settings && typeof body.settings === "object" ? body.settings as Record<string, unknown> : body as Record<string, unknown>;
    const providerId = String(input.providerId ?? "").trim().slice(0, 200);
    const imageCount = Math.max(1, Math.min(10, Math.trunc(Number(input.imageCount) || 1)));
    const size = String(input.size ?? "").trim().slice(0, 100);
    const quality = String(input.quality ?? "").trim().slice(0, 100);
    const promptOptimizerModel = String(input.promptOptimizerModel ?? "system").trim().slice(0, 500) || "system";
    const optimizeStyle = String(input.promptInputOptimizeStyle ?? "standard").trim().slice(0, 100) || "standard";
    const colorSchemeIds = normalizeIds(input.promptColorSchemeIds);
    const colorInjection = String(input.promptColorSchemeInjection ?? "").trim().slice(0, 2000);
    const timestamp = now();
    run(
      appDb,
      `insert into composer_settings (
        user_id, session_id, provider_id, image_count, size, quality, prompt_optimizer_model,
        prompt_input_optimize_style, prompt_color_scheme_ids_json,
        prompt_color_scheme_injection, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(user_id, session_id) do update set
        provider_id = excluded.provider_id,
        image_count = excluded.image_count,
        size = excluded.size,
        quality = excluded.quality,
        prompt_optimizer_model = excluded.prompt_optimizer_model,
        prompt_input_optimize_style = excluded.prompt_input_optimize_style,
        prompt_color_scheme_ids_json = excluded.prompt_color_scheme_ids_json,
        prompt_color_scheme_injection = excluded.prompt_color_scheme_injection,
        updated_at = excluded.updated_at`,
      user.id,
      sessionId,
      providerId,
      imageCount,
      size,
      quality,
      promptOptimizerModel,
      optimizeStyle,
      JSON.stringify(colorSchemeIds),
      colorInjection,
      timestamp,
      timestamp
    );
    const row = getOne<ComposerSettingsRow>(appDb, "select * from composer_settings where user_id = ? and session_id = ?", user.id, sessionId);
    return c.json({ settings: publicSettings(row) });
  });
}
