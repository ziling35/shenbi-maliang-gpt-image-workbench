import { appDb, getOne } from "./db";

const previousStageAtByJobId = new Map<string, number>();

type ImageJobTraceDetails = Record<string, unknown>;

export function logImageJobTrace(jobId: string | null | undefined, stage: string, details: ImageJobTraceDetails = {}) {
  const normalizedJobId = String(jobId ?? "").trim();
  if (!normalizedJobId) return;
  const timestampMs = Date.now();
  const row = getOne<{ created_at: string }>(appDb, "select created_at from image_jobs where id = ? limit 1", normalizedJobId);
  const createdAtMs = row?.created_at ? Date.parse(row.created_at) : Number.NaN;
  const previousStageAt = previousStageAtByJobId.get(normalizedJobId);
  previousStageAtByJobId.set(normalizedJobId, timestampMs);
  console.info("图片任务链路", {
    jobId: normalizedJobId,
    stage,
    at: new Date(timestampMs).toISOString(),
    ...(Number.isFinite(createdAtMs) ? { totalDurationMs: Math.max(0, timestampMs - createdAtMs) } : {}),
    ...(previousStageAt ? { sincePreviousStageMs: Math.max(0, timestampMs - previousStageAt) } : {}),
    ...details
  });
}
