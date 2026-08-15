import type { Hono } from "hono";
import { requireConfig, requireUser } from "./auth";
import { refundVideoCharge, reserveVideoCharge } from "./billing";
import { appDb, configDb, getAll, getOne, run } from "./db";
import { proxyFetch } from "./providerHttp";
import { readStoredFile, secureVideoPath, writeEncryptedFile } from "./secureFiles";
import { makeId, maskSecret, normalizePath, now, safeJson } from "./utils";

type VideoProviderRow = {
  id: string;
  name: string;
  enabled: number;
  base_url: string;
  api_key_env: string;
  api_key_value: string;
  model: string;
  protocol: "veo_videos" | "grok_videos";
  proxy_enabled: number;
  created_at: string;
  updated_at: string;
};

type VideoJobRow = {
  id: string;
  user_id: string;
  provider_id: string;
  model: string;
  mode: string;
  prompt: string;
  negative_prompt: string;
  duration: number;
  aspect_ratio: string;
  generate_audio: number;
  input_images_json: string;
  remote_task_id: string;
  status: string;
  progress: number;
  remote_url: string;
  path: string;
  mime_type: string;
  file_size: number;
  error: string;
  amount_cents: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const videoPollTimers = new Map<string, ReturnType<typeof setTimeout>>();
const activeVideoPolls = new Set<string>();

function videoApiKey(provider: VideoProviderRow) {
  return provider.api_key_value || (provider.api_key_env ? Bun.env[provider.api_key_env] ?? "" : "");
}

function videoHeaders(provider: VideoProviderRow) {
  const key = videoApiKey(provider);
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(key ? { Authorization: `Bearer ${key}` } : {})
  };
}

async function videoFetch(provider: VideoProviderRow, input: string, init: RequestInit) {
  return provider.proxy_enabled ? proxyFetch(input, init) : fetch(input, init);
}

function publicVideoProvider(row: VideoProviderRow, includeSecret = false) {
  return {
    id: row.id,
    name: row.name,
    enabled: Boolean(row.enabled),
    baseUrl: row.base_url,
    apiKeyEnv: row.api_key_env,
    apiKeyValue: includeSecret ? row.api_key_value : maskSecret(row.api_key_value),
    model: row.model,
    protocol: row.protocol,
    proxyEnabled: Boolean(row.proxy_enabled)
  };
}

function publicVideoJob(row: VideoJobRow) {
  return {
    id: row.id,
    providerId: row.provider_id,
    model: row.model,
    mode: row.mode,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt,
    duration: row.duration,
    aspectRatio: row.aspect_ratio,
    generateAudio: Boolean(row.generate_audio),
    inputImages: safeJson<string[]>(row.input_images_json, []),
    status: row.status,
    progress: row.progress,
    error: row.error,
    amountCents: row.amount_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? "",
    videoUrl: row.path ? `/api/files/videos/${encodeURIComponent(row.id)}` : ""
  };
}

function normalizeVideoMode(value: unknown) {
  const mode = String(value ?? "text").trim();
  return ["text", "image", "frames", "reference", "edit", "extension"].includes(mode) ? mode : "text";
}

function validateVideoRequest(provider: VideoProviderRow, input: Record<string, unknown>) {
  const mode = normalizeVideoMode(input.mode);
  const prompt = String(input.prompt ?? "").trim();
  const duration = Math.trunc(Number(input.duration));
  const aspectRatio = String(input.aspectRatio ?? "16:9").trim();
  const imageUrls = Array.isArray(input.imageUrls) ? input.imageUrls.map(String).map((item) => item.trim()).filter(Boolean) : [];
  const videoUrl = String(input.videoUrl ?? "").trim();
  if (!prompt && mode !== "extension") throw new Error("请填写视频提示词");
  if (![4, 6, 8].includes(duration)) throw new Error("视频时长只支持 4、6 或 8 秒");
  if (!["16:9", "9:16"].includes(aspectRatio)) throw new Error("视频比例只支持 16:9 或 9:16");
  if (mode === "image" && imageUrls.length !== 1) throw new Error("单图生视频需要提供一张图片");
  if (mode === "frames" && imageUrls.length !== 2) throw new Error("首尾帧视频需要提供两张图片");
  if (provider.protocol === "grok_videos" && mode === "frames") throw new Error("Grok 视频渠道暂不支持首尾帧模式，请使用单图或参考图模式");
  if (provider.protocol === "grok_videos" && ["edit", "extension"].includes(mode) && !videoUrl) throw new Error("视频编辑或延长需要提供视频 URL");
  if (mode === "reference" && provider.protocol !== "grok_videos") {
    if (provider.model !== "veo-3.1-generate-preview-ref") throw new Error("多参考图只能使用 veo-3.1-generate-preview-ref");
    if (imageUrls.length === 0) throw new Error("多参考图视频至少需要一张参考图");
    if (duration !== 8 || aspectRatio !== "16:9") throw new Error("多参考图视频固定为 8 秒、16:9");
  }
  if (mode !== "reference" && provider.protocol !== "grok_videos" && provider.model === "veo-3.1-generate-preview-ref" && imageUrls.length > 0) {
    throw new Error("参考模型带图时请使用多参考图模式");
  }
  return { mode, prompt, duration, aspectRatio, imageUrls, videoUrl };
}

function videoSubmitPayload(provider: VideoProviderRow, input: Record<string, unknown>) {
  const validated = validateVideoRequest(provider, input);
  const payload: Record<string, unknown> = {
    model: provider.model,
    prompt: validated.prompt,
    duration: validated.duration,
    aspect_ratio: validated.aspectRatio,
    generate_audio: input.generateAudio !== false
  };
  const negativePrompt = String(input.negativePrompt ?? "").trim();
  if (negativePrompt) payload.negative_prompt = negativePrompt;
  if (provider.protocol === "grok_videos") {
    delete payload.generate_audio;
    if (validated.mode === "edit" || validated.mode === "extension") {
      payload.video = { url: validated.videoUrl };
    } else {
      payload.resolution = String(input.resolution ?? "720p");
    }
    if (validated.mode === "extension") payload.duration = Math.max(2, Math.min(10, validated.duration));
    if (validated.mode === "image") payload.image = { url: validated.imageUrls[0] };
    if (validated.mode === "reference") payload.reference_images = validated.imageUrls.map((url) => ({ url }));
  } else {
    if (validated.mode === "image") payload.image_url = validated.imageUrls[0];
    if (validated.mode === "frames" || validated.mode === "reference") payload.image_urls = validated.imageUrls;
  }
  return { payload, ...validated, negativePrompt };
}

async function downloadCompletedVideo(job: VideoJobRow, remoteUrl: string) {
  const provider = getOne<VideoProviderRow>(configDb, "select * from video_provider_configs where id=?", job.provider_id);
  if (!provider) throw new Error("视频渠道配置不存在");
  const response = await videoFetch(provider, remoteUrl, { headers: { Accept: "video/*,*/*" } });
  if (!response.ok) throw new Error(`视频文件下载失败 ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error("视频文件为空");
  const path = secureVideoPath(job.user_id, job.id);
  await writeEncryptedFile(path, buffer);
  const mimeType = response.headers.get("content-type")?.split(";")[0] || "video/mp4";
  run(appDb, "update video_jobs set status='completed',progress=100,remote_url=?,path=?,mime_type=?,file_size=?,error='',completed_at=?,updated_at=? where id=?", remoteUrl, path, mimeType, buffer.length, now(), now(), job.id);
}

function scheduleVideoPoll(jobId: string, delay = 5000) {
  const current = videoPollTimers.get(jobId);
  if (current) clearTimeout(current);
  videoPollTimers.set(jobId, setTimeout(() => {
    videoPollTimers.delete(jobId);
    void pollVideoJob(jobId);
  }, delay));
}

async function pollVideoJob(jobId: string) {
  if (activeVideoPolls.has(jobId)) return;
  activeVideoPolls.add(jobId);
  try {
    const job = getOne<VideoJobRow>(appDb, "select * from video_jobs where id=?", jobId);
    if (!job || ["completed", "failed", "cancelled"].includes(job.status)) return;
    const provider = getOne<VideoProviderRow>(configDb, "select * from video_provider_configs where id=?", job.provider_id);
    if (!provider) throw new Error("视频渠道配置不存在");
    const endpoint = normalizePath(provider.base_url, `/v1/videos/${encodeURIComponent(job.remote_task_id)}`);
    const response = await videoFetch(provider, endpoint, { headers: videoHeaders(provider) });
    const text = await response.text();
    const data = safeJson<Record<string, unknown>>(text, {});
    if (!response.ok) throw new Error(String(data.error ?? data.message ?? `轮询失败 ${response.status}`));
    const status = String(data.status ?? data.state ?? "").toLowerCase();
    if (status === "completed" || status === "done") {
      const result = (data.result && typeof data.result === "object" ? data.result : {}) as Record<string, unknown>;
      const url = String(data.url ?? result.url ?? data.video_url ?? "").trim();
      if (!url) throw new Error("视频任务已完成但未返回下载地址");
      await downloadCompletedVideo(job, url);
      return;
    }
    if (status === "failed" || status === "error") {
      const error = String(data.error ?? data.message ?? "上游视频生成失败");
      run(appDb, "update video_jobs set status='failed',progress=100,error=?,updated_at=? where id=?", error, now(), jobId);
      refundVideoCharge(jobId);
      return;
    }
    const progress = status === "in_progress" ? Math.max(10, Math.min(95, job.progress + 8)) : Math.max(2, job.progress);
    run(appDb, "update video_jobs set status=?,progress=?,updated_at=? where id=?", status === "in_progress" ? "in_progress" : "queued", progress, now(), jobId);
    scheduleVideoPoll(jobId);
  } catch (error) {
    const job = getOne<VideoJobRow>(appDb, "select * from video_jobs where id=?", jobId);
    if (job && Date.now() - new Date(job.created_at).getTime() < 30 * 60 * 1000) {
      run(appDb, "update video_jobs set error=?,updated_at=? where id=?", error instanceof Error ? error.message : String(error), now(), jobId);
      scheduleVideoPoll(jobId, 8000);
    } else if (job) {
      run(appDb, "update video_jobs set status='failed',progress=100,error=?,updated_at=? where id=?", error instanceof Error ? error.message : String(error), now(), jobId);
      refundVideoCharge(jobId);
    }
  } finally {
    activeVideoPolls.delete(jobId);
  }
}

export function startInterruptedVideoJobRecovery() {
  const jobs = getAll<{ id: string }>(appDb, "select id from video_jobs where status in ('queued','in_progress') and remote_task_id<>''");
  for (const job of jobs) scheduleVideoPoll(job.id, 1000);
}

export function registerVideoRoutes(api: Hono) {
  api.get("/video/providers", async (c) => {
    const user = await requireUser(c);
    if (!user) return c.json({ error: "未登录" }, 401);
    const providers = getAll<VideoProviderRow>(configDb, "select * from video_provider_configs where enabled=1 order by created_at asc");
    const prices = getAll<{ provider_id: string; model: string; duration: number; price_cents: number; enabled: number }>(configDb, "select * from billing_video_model_prices where enabled=1");
    return c.json({ providers: providers.map((row) => ({ ...publicVideoProvider(row), prices: prices.filter((price) => price.provider_id === row.id && price.model === row.model).map((price) => ({ duration: price.duration, priceCents: price.price_cents })) })) });
  });

  api.get("/videos", async (c) => {
    const user = await requireUser(c);
    if (!user) return c.json({ error: "未登录" }, 401);
    return c.json({ jobs: getAll<VideoJobRow>(appDb, "select * from video_jobs where user_id=? order by created_at desc limit 50", user.id).map(publicVideoJob) });
  });

  api.post("/videos", async (c) => {
    const user = await requireUser(c);
    if (!user) return c.json({ error: "未登录" }, 401);
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const providerId = String(body.providerId ?? "").trim();
    const provider = getOne<VideoProviderRow>(configDb, "select * from video_provider_configs where id=? and enabled=1", providerId);
    if (!provider) return c.json({ error: "视频渠道不可用" }, 400);
    const prepared = videoSubmitPayload(provider, body);
    const id = makeId("video");
    const timestamp = now();
    const storedInputImages = prepared.imageUrls.filter((value) => !value.startsWith("data:"));
    run(appDb, `insert into video_jobs(id,user_id,provider_id,model,mode,prompt,negative_prompt,duration,aspect_ratio,generate_audio,input_images_json,status,progress,created_at,updated_at)
      values(?,?,?,?,?,?,?,?,?,?,?,'queued',0,?,?)`, id, user.id, provider.id, provider.model, prepared.mode, prepared.prompt, prepared.negativePrompt, prepared.duration, prepared.aspectRatio, body.generateAudio === false ? 0 : 1, JSON.stringify(storedInputImages), timestamp, timestamp);
    try {
      const amount = reserveVideoCharge(user.id, id, provider.id, provider.model, prepared.duration);
      run(appDb, "update video_jobs set amount_cents=? where id=?", amount, id);
      const endpoint = normalizePath(provider.base_url, provider.protocol === "grok_videos"
        ? prepared.mode === "edit" ? "/v1/videos/edits" : prepared.mode === "extension" ? "/v1/videos/extensions" : "/v1/videos/generations"
        : "/v1/videos");
      const response = await videoFetch(provider, endpoint, { method: "POST", headers: videoHeaders(provider), body: JSON.stringify(prepared.payload) });
      const text = await response.text();
      const data = safeJson<Record<string, unknown>>(text, {});
      if (!response.ok) throw new Error(String(data.error ?? data.message ?? `视频提交失败 ${response.status}`));
      const remoteTaskId = String(data.id ?? data.request_id ?? "").trim();
      if (!remoteTaskId) throw new Error("视频渠道未返回任务 ID");
      run(appDb, "update video_jobs set remote_task_id=?,status=?,progress=2,updated_at=? where id=?", remoteTaskId, String(data.status ?? "queued"), now(), id);
      scheduleVideoPoll(id);
      return c.json({ job: publicVideoJob(getOne<VideoJobRow>(appDb, "select * from video_jobs where id=?", id)!) });
    } catch (error) {
      run(appDb, "update video_jobs set status='failed',progress=100,error=?,updated_at=? where id=?", error instanceof Error ? error.message : String(error), now(), id);
      refundVideoCharge(id);
      throw error;
    }
  });

  api.get("/files/videos/:videoId", async (c) => {
    const user = await requireUser(c);
    if (!user) return c.json({ error: "未登录" }, 401);
    const job = getOne<VideoJobRow>(appDb, "select * from video_jobs where id=? and user_id=?", c.req.param("videoId"), user.id);
    if (!job?.path) return c.json({ error: "视频不存在" }, 404);
    const buffer = await readStoredFile(job.path);
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": job.mime_type || "video/mp4", "Content-Length": String(buffer.length), "Cache-Control": "private, max-age=3600" } });
  });

  api.get("/config/video-providers", (c) => {
    const blocked = requireConfig(c);
    if (blocked) return blocked;
    return c.json({
      providers: getAll<VideoProviderRow>(configDb, "select * from video_provider_configs order by created_at asc").map((row) => publicVideoProvider(row, true)),
      prices: getAll(configDb, "select provider_id,model,duration,price_cents,enabled,updated_at from billing_video_model_prices order by provider_id,model,duration")
    });
  });

  api.put("/config/video-providers", async (c) => {
    const blocked = requireConfig(c);
    if (blocked) return blocked;
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const providers = Array.isArray(body.providers) ? body.providers as Array<Record<string, unknown>> : [];
    const prices = Array.isArray(body.prices) ? body.prices as Array<Record<string, unknown>> : [];
    const timestamp = now();
    configDb.exec("begin immediate");
    try {
      const ids: string[] = [];
      for (const raw of providers) {
        const id = String(raw.id ?? "").trim() || makeId("video-provider");
        ids.push(id);
        const existing = getOne<VideoProviderRow>(configDb, "select * from video_provider_configs where id=?", id);
        const enteredKey = String(raw.apiKeyValue ?? "");
        const apiKey = enteredKey.includes("****") ? existing?.api_key_value ?? "" : enteredKey;
        run(configDb, `insert into video_provider_configs(id,name,enabled,base_url,api_key_env,api_key_value,model,protocol,proxy_enabled,created_at,updated_at)
          values(?,?,?,?,?,?,?,?,?,?,?) on conflict(id) do update set name=excluded.name,enabled=excluded.enabled,base_url=excluded.base_url,api_key_env=excluded.api_key_env,api_key_value=excluded.api_key_value,model=excluded.model,protocol=excluded.protocol,proxy_enabled=excluded.proxy_enabled,updated_at=excluded.updated_at`,
          id, String(raw.name ?? "视频渠道"), raw.enabled === false ? 0 : 1, String(raw.baseUrl ?? "").trim(), String(raw.apiKeyEnv ?? ""), apiKey, String(raw.model ?? "veo-3.1-fast-generate-preview"), String(raw.protocol ?? "veo_videos"), raw.proxyEnabled ? 1 : 0, existing?.created_at ?? timestamp, timestamp);
      }
      if (ids.length) run(configDb, `delete from video_provider_configs where id not in (${ids.map(() => "?").join(",")})`, ...ids);
      else run(configDb, "delete from video_provider_configs");
      run(configDb, "delete from billing_video_model_prices");
      for (const raw of prices) {
        const providerId = String(raw.providerId ?? raw.provider_id ?? "").trim();
        const model = String(raw.model ?? "").trim();
        const duration = Math.trunc(Number(raw.duration));
        const priceCents = Math.max(0, Math.round(Number(raw.price ?? 0) * 100));
        if (providerId && model && [4, 6, 8].includes(duration)) run(configDb, "insert into billing_video_model_prices(provider_id,model,duration,price_cents,enabled,updated_at) values(?,?,?,?,?,?)", providerId, model, duration, priceCents, raw.enabled === false ? 0 : 1, timestamp);
      }
      configDb.exec("commit");
      return c.json({ ok: true });
    } catch (error) { configDb.exec("rollback"); throw error; }
  });
}
