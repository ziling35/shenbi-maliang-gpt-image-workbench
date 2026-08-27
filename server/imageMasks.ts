import path from "node:path";
import sharp from "sharp";
import { SAFE_IMAGE_MAX_PIXELS } from "./imageValidation";
import { readStoredFile, writeEncryptedFile } from "./secureFiles";

function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) throw new Error("遮罩图片数据格式不正确");
  const payload = match[3] ?? "";
  return {
    mimeType: match[1] || "image/png",
    buffer: match[2] ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload))
  };
}

function maskMimeTypeFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

function maskExtension(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

export async function normalizeImageEditMaskDataUrl(dataUrl: string) {
  return normalizeImageEditMaskDataUrlToDimensions(dataUrl);
}

export async function imageDataUrlDimensions(dataUrl: string) {
  const { buffer } = dataUrlToBuffer(dataUrl);
  const metadata = await sharp(buffer, { limitInputPixels: SAFE_IMAGE_MAX_PIXELS, sequentialRead: true }).metadata();
  return {
    width: Number.isFinite(metadata.width) ? Number(metadata.width) : 0,
    height: Number.isFinite(metadata.height) ? Number(metadata.height) : 0
  };
}

export async function normalizeImageEditMaskDataUrlToDimensions(
  dataUrl: string,
  target?: { width: number; height: number }
) {
  const { buffer } = dataUrlToBuffer(dataUrl);
  const sourceMetadata = await sharp(buffer, { limitInputPixels: SAFE_IMAGE_MAX_PIXELS, sequentialRead: true }).metadata();
  const targetWidth = Math.max(0, Math.trunc(target?.width ?? 0));
  const targetHeight = Math.max(0, Math.trunc(target?.height ?? 0));
  const needsResize = targetWidth > 0
    && targetHeight > 0
    && (sourceMetadata.width !== targetWidth || sourceMetadata.height !== targetHeight);
  const normalizedInput = needsResize
    ? await sharp(buffer, { limitInputPixels: SAFE_IMAGE_MAX_PIXELS, sequentialRead: true })
        .resize({ width: targetWidth, height: targetHeight, fit: "fill", kernel: sharp.kernel.nearest })
        .png()
        .toBuffer()
    : buffer;
  const { data, info } = await sharp(normalizedInput, { limitInputPixels: SAFE_IMAGE_MAX_PIXELS, sequentialRead: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels || 4;

  for (let index = 0; index < data.length; index += channels) {
    const alphaIndex = index + channels - 1;
    const alpha = data[alphaIndex] ?? 255;
    const editable = alpha < 255;
    data[index] = editable ? 0 : 255;
    data[index + 1] = editable ? 0 : 255;
    data[index + 2] = editable ? 0 : 255;
    data[alphaIndex] = alpha <= 8 ? 0 : alpha;
  }

  const normalized = await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels
    },
    limitInputPixels: SAFE_IMAGE_MAX_PIXELS
  })
    .png()
    .toBuffer();

  return `data:image/png;base64,${normalized.toString("base64")}`;
}

export async function saveImageEditMaskSnapshot(jobId: string, dataUrl: string) {
  if (!jobId || !dataUrl.trim()) return null;
  const { mimeType, buffer } = dataUrlToBuffer(dataUrl);
  const extension = maskExtension(mimeType);
  const fileName = `${jobId}.${extension}`;
  const relativePath = `files/image-masks/${fileName}`;
  await writeEncryptedFile(relativePath, buffer);
  return {
    path: relativePath,
    mimeType
  };
}

export async function imageEditMaskSnapshotDataUrl(relativePath: string) {
  const cleanPath = relativePath.trim().replace(/^\/+/, "");
  if (!cleanPath || cleanPath.includes("..")) return "";
  const buffer = await readStoredFile(cleanPath);
  return `data:${maskMimeTypeFromPath(cleanPath)};base64,${buffer.toString("base64")}`;
}
