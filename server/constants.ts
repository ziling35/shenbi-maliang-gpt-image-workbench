export const APP_COOKIE = "app_session";
export const CONFIG_COOKIE = "config_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
export const IMAGE_JOB_RUNNING_TIMEOUT_MS = 30 * 60 * 1000;
export const IMAGE_JOB_TIMEOUT_ERROR = "任务已超时，请重新生成";
export const PROVIDER_REQUEST_TIMEOUT_ERROR = "图片接口请求超时，请重新生成";
export const DEFAULT_RESPONSES_MODEL = "gpt-5.5";
export const CPA_RESPONSES_MODEL_FALLBACK = "gpt-5.4-mini";
export const DEFAULT_IMAGE_MODEL = "gpt-image-2";
export const DEFAULT_REQUEST_SIZE = "auto";
export const DEFAULT_IMAGE_RESULT_RETRY_COUNT = 1;
export const DEFAULT_IMAGE_SIZES = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9"];
export const DEFAULT_IMAGE_QUALITIES = ["low", "medium", "high"];
export const CUSTOM_IMAGE_DIMENSION_MIN = 64;
export const CUSTOM_IMAGE_DIMENSION_MAX = 16384;
export const LOGIN_ASSET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
export const AUTO_PROVIDER_ID = "auto";
export const STUDIO_BACKEND_BASE_URL = "https://chatgpt.com/backend-api";
export const STUDIO_CODEX_USER_AGENT =
  "codex-tui/0.118.0 (Mac OS 26.3.1; arm64) iTerm.app/3.6.9 (codex-tui; 0.118.0)";
export const STUDIO_LEGACY_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

export function requestImageSize(value: unknown) {
  const size = String(value ?? "").trim();
  return size || DEFAULT_REQUEST_SIZE;
}

export function customImageDimensions(value: unknown) {
  const match = String(value ?? "").trim().match(/^(\d+)x(\d+)$/i);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function imageRequestSizeError(value: unknown) {
  const text = String(value ?? "").trim();
  const dimensions = customImageDimensions(text);
  if (!dimensions) return "";
  if (dimensions.width < CUSTOM_IMAGE_DIMENSION_MIN || dimensions.height < CUSTOM_IMAGE_DIMENSION_MIN) {
    return `自定义分辨率不能小于 ${CUSTOM_IMAGE_DIMENSION_MIN}×${CUSTOM_IMAGE_DIMENSION_MIN}`;
  }
  if (dimensions.width > CUSTOM_IMAGE_DIMENSION_MAX || dimensions.height > CUSTOM_IMAGE_DIMENSION_MAX) {
    return `自定义分辨率不能超过 ${CUSTOM_IMAGE_DIMENSION_MAX}×${CUSTOM_IMAGE_DIMENSION_MAX}`;
  }
  return "";
}

export function requestImageCount(value: unknown) {
  const count = Number.parseInt(String(value ?? "1"), 10);
  if (!Number.isFinite(count)) return 1;
  return Math.max(1, Math.min(10, count));
}

export function requestImageResultRetryCount(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const count = Number.parseInt(text, 10);
  if (!Number.isFinite(count)) return null;
  return Math.max(0, Math.min(10, count));
}

export function resolveImageResultRetryCount(value: unknown) {
  return requestImageResultRetryCount(value) ?? 0;
}
