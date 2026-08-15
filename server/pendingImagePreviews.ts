import { randomBytes } from "node:crypto";
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
};

export type CreatedPendingImagePreview = {
  token: string;
  previewId: string;
  url: string;
  directUrl?: string;
};

export type PendingImagePreviewStreamWriter = CreatedPendingImagePreview & {
  write: (chunk: Uint8Array) => void;
  finish: () => void;
  fail: () => void;
};

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
    failed: false
  };
  pendingPreviews.set(token, {
    token,
    previewId,
    userId: input.userId,
    jobId: input.jobId,
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
    write(chunk) {
      if (liveStream.done || chunk.byteLength === 0) return;
      const buffer = Buffer.from(chunk);
      liveStream.chunks.push(buffer);
      for (const controller of Array.from(liveStream.controllers)) {
        try {
          controller.enqueue(new Uint8Array(buffer));
        } catch {
          liveStream.controllers.delete(controller);
        }
      }
    },
    finish() {
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

export function releasePendingImagePreviewsForJob(jobId: string, immediate = false) {
  const expiresAt = Date.now() + (immediate ? 0 : PENDING_IMAGE_PREVIEW_RETAIN_AFTER_SAVE_MS);
  for (const preview of pendingPreviews.values()) {
    if (preview.jobId === jobId) preview.expiresAt = expiresAt;
  }
  if (immediate) cleanupExpiredPendingPreviews();
}
