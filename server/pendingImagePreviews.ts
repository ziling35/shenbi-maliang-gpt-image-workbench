import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { providerImagePreviewItems, type ProviderImagePreviewItem } from "./imageFiles";
import type { ProviderRow } from "./types";

const PENDING_IMAGE_PREVIEW_TTL_MS = 10 * 60 * 1000;
const PENDING_IMAGE_PREVIEW_RETAIN_AFTER_SAVE_MS = 60 * 1000;
const pendingPreviews = new Map<string, PendingImagePreview>();

type PendingImagePreview = {
  token: string;
  previewId: string;
  userId: string;
  jobId: string;
  imageIndex: number;
  mimeType: string;
  buffer?: Buffer;
  remoteUrl?: string;
  provider?: ProviderRow;
  liveStream?: PendingImageLiveStream;
  expiresAt: number;
};

type PendingImageLiveStream = {
  chunks: Buffer[];
  controllers: Set<ReadableStreamDefaultController<Uint8Array>>;
  done: boolean;
  failed: boolean;
  bytesReceived: number;
  frameBuffer?: Buffer;
  frameVersion: number;
  frameRendering: boolean;
  lastFrameBytes: number;
  lastFrameAt: number;
};

export type CreatedPendingImagePreview = {
  token: string;
  previewId: string;
  url: string;
  directUrl?: string;
};

export type PendingImagePreviewStreamWriter = CreatedPendingImagePreview & {
  setMimeType: (mimeType: string) => void;
  write: (chunk: Uint8Array) => void;
  finish: () => void;
  fail: () => void;
};

export type ActivePendingImagePreview = {
  previewId: string;
  jobId: string;
  imageIndex: number;
  url: string;
  fallbackUrl: string;
  mimeType: string;
  streaming: boolean;
};

const PROGRESSIVE_FRAME_INITIAL_BYTES = 128 * 1024;
const PROGRESSIVE_FRAME_STEP_BYTES = 2 * 1024 * 1024;
const PROGRESSIVE_FRAME_INTERVAL_MS = 1200;

function scheduleProgressiveFrame(liveStream: PendingImageLiveStream, force = false) {
  if (liveStream.frameRendering || liveStream.bytesReceived < PROGRESSIVE_FRAME_INITIAL_BYTES) return;
  const timestamp = Date.now();
  if (!force
    && liveStream.lastFrameBytes > 0
    && liveStream.bytesReceived - liveStream.lastFrameBytes < PROGRESSIVE_FRAME_STEP_BYTES
    && timestamp - liveStream.lastFrameAt < PROGRESSIVE_FRAME_INTERVAL_MS) return;
  const sourceBytes = liveStream.bytesReceived;
  const source = Buffer.concat(liveStream.chunks, sourceBytes);
  liveStream.frameRendering = true;
  liveStream.lastFrameBytes = sourceBytes;
  liveStream.lastFrameAt = timestamp;
  void sharp(source, { failOn: "none", sequentialRead: true })
    .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer()
    .then((buffer) => {
      if (buffer.length === 0) return;
      liveStream.frameBuffer = buffer;
      liveStream.frameVersion += 1;
    })
    .catch(() => undefined)
    .finally(() => {
      liveStream.frameRendering = false;
      if (!liveStream.done && liveStream.bytesReceived > sourceBytes) scheduleProgressiveFrame(liveStream);
    });
}

function cleanupExpiredPendingPreviews() {
  const timestamp = Date.now();
  for (const [token, preview] of pendingPreviews) {
    if (preview.expiresAt <= timestamp) pendingPreviews.delete(token);
  }
}

const cleanupTimer = setInterval(cleanupExpiredPendingPreviews, 60 * 1000);
cleanupTimer.unref?.();

function imageMimeTypeFromDataUrl(value: string) {
  return value.match(/^data:(image\/[a-z0-9.+-]+);base64,/i)?.[1]?.toLowerCase() || "";
}

function decodeBase64Image(value: string) {
  const dataUrlMimeType = imageMimeTypeFromDataUrl(value);
  const clean = value.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
  const buffer = Buffer.from(clean, "base64");
  return { buffer, mimeType: dataUrlMimeType };
}

function absoluteProviderImageUrl(provider: ProviderRow, value: string) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return new URL(trimmed, provider.base_url).toString();
  return new URL(trimmed, `${provider.base_url.replace(/\/+$/, "")}/`).toString();
}

export function createPendingImagePreviews(input: {
  responseJson: unknown;
  provider: ProviderRow;
  userId: string;
  jobId: string;
  imageIndexStart: number;
  imageTotal: number;
  limit: number;
}): Array<CreatedPendingImagePreview & { previewItem: ProviderImagePreviewItem }> {
  cleanupExpiredPendingPreviews();
  const items = providerImagePreviewItems(input.responseJson, input.provider).slice(0, Math.max(0, input.limit));
  return items.flatMap((item, index) => {
    const token = randomBytes(24).toString("base64url");
    const previewId = `pending:${input.jobId}:${input.imageIndexStart + index}`;
    let buffer: Buffer | undefined;
    let mimeType = item.mimeType || "image/png";
    let remoteUrl: string | undefined;
    if (item.kind === "base64") {
      const decoded = decodeBase64Image(item.value);
      if (decoded.buffer.length === 0) return [];
      buffer = decoded.buffer;
      mimeType = decoded.mimeType || mimeType;
    } else {
      remoteUrl = absoluteProviderImageUrl(input.provider, item.value);
    }
    pendingPreviews.set(token, {
      token,
      previewId,
      userId: input.userId,
      jobId: input.jobId,
      imageIndex: input.imageIndexStart + index,
      mimeType,
      buffer,
      remoteUrl,
      provider: item.kind === "url" ? input.provider : undefined,
      expiresAt: Date.now() + PENDING_IMAGE_PREVIEW_TTL_MS
    });
    return [{
      token,
      previewId,
      url: `/api/files/pending-images/${encodeURIComponent(token)}`,
      ...(remoteUrl ? { directUrl: remoteUrl } : {}),
      previewItem: item
    }];
  });
}

export function createStreamingPendingImagePreview(input: {
  provider: ProviderRow;
  userId: string;
  jobId: string;
  imageIndex: number;
  mimeType: string;
}): PendingImagePreviewStreamWriter {
  cleanupExpiredPendingPreviews();
  const token = randomBytes(24).toString("base64url");
  const previewId = `pending:${input.jobId}:${input.imageIndex}`;
  const liveStream: PendingImageLiveStream = {
    chunks: [],
    controllers: new Set(),
    done: false,
    failed: false,
    bytesReceived: 0,
    frameVersion: 0,
    frameRendering: false,
    lastFrameBytes: 0,
    lastFrameAt: 0
  };
  pendingPreviews.set(token, {
    token,
    previewId,
    userId: input.userId,
    jobId: input.jobId,
    imageIndex: input.imageIndex,
    mimeType: input.mimeType || "image/png",
    provider: input.provider,
    liveStream,
    expiresAt: Date.now() + PENDING_IMAGE_PREVIEW_TTL_MS
  });
  const closeControllers = (failed: boolean) => {
    liveStream.done = true;
    liveStream.failed = failed;
    for (const controller of Array.from(liveStream.controllers)) {
      try {
        if (failed) controller.error(new Error("图片流接收失败"));
        else controller.close();
      } catch {
      }
    }
    liveStream.controllers.clear();
  };
  return {
    token,
    previewId,
    url: `/api/files/pending-images/${encodeURIComponent(token)}`,
    setMimeType(mimeType) {
      const normalized = mimeType.trim().toLowerCase();
      if (normalized.startsWith("image/")) {
        const preview = pendingPreviews.get(token);
        if (preview) preview.mimeType = normalized;
      }
    },
    write(chunk) {
      if (liveStream.done || chunk.byteLength === 0) return;
      const buffer = Buffer.from(chunk);
      liveStream.chunks.push(buffer);
      liveStream.bytesReceived += buffer.length;
      scheduleProgressiveFrame(liveStream);
      for (const controller of Array.from(liveStream.controllers)) {
        try {
          controller.enqueue(new Uint8Array(buffer));
        } catch {
          liveStream.controllers.delete(controller);
        }
      }
    },
    finish() {
      scheduleProgressiveFrame(liveStream, true);
      closeControllers(false);
    },
    fail() {
      closeControllers(true);
    }
  };
}

export function getPendingImagePreview(userId: string, token: string) {
  cleanupExpiredPendingPreviews();
  const preview = pendingPreviews.get(token);
  if (!preview || preview.userId !== userId) return null;
  preview.expiresAt = Date.now() + PENDING_IMAGE_PREVIEW_TTL_MS;
  return preview;
}

export function activePendingImagePreviewsForJobs(userId: string, jobIds: string[]) {
  cleanupExpiredPendingPreviews();
  const targetJobIds = new Set(jobIds.map((jobId) => jobId.trim()).filter(Boolean));
  if (targetJobIds.size === 0) return new Map<string, ActivePendingImagePreview[]>();
  const previewsByJobId = new Map<string, ActivePendingImagePreview[]>();
  for (const preview of pendingPreviews.values()) {
    if (preview.userId !== userId || !targetJobIds.has(preview.jobId)) continue;
    const fallbackUrl = `/api/files/pending-images/${encodeURIComponent(preview.token)}`;
    const activePreview: ActivePendingImagePreview = {
      previewId: preview.previewId,
      jobId: preview.jobId,
      imageIndex: preview.imageIndex,
      url: preview.remoteUrl ?? fallbackUrl,
      fallbackUrl,
      mimeType: preview.mimeType,
      streaming: Boolean(preview.liveStream)
    };
    const previews = previewsByJobId.get(preview.jobId) ?? [];
    previews.push(activePreview);
    previewsByJobId.set(preview.jobId, previews);
  }
  for (const previews of previewsByJobId.values()) previews.sort((left, right) => left.imageIndex - right.imageIndex);
  return previewsByJobId;
}

export function releasePendingImagePreviewsForJob(jobId: string, immediate = false) {
  const expiresAt = Date.now() + (immediate ? 0 : PENDING_IMAGE_PREVIEW_RETAIN_AFTER_SAVE_MS);
  for (const preview of pendingPreviews.values()) {
    if (preview.jobId === jobId) preview.expiresAt = expiresAt;
  }
  if (immediate) cleanupExpiredPendingPreviews();
}
