const reportedTraceKeys = new Set<string>();

export function reportImageJobClientTrace(
  jobId: string | null | undefined,
  stage: string,
  details: Record<string, unknown> = {},
  dedupeKey = stage
) {
  const normalizedJobId = String(jobId ?? "").trim();
  if (!normalizedJobId) return;
  const key = `${normalizedJobId}:${dedupeKey}`;
  if (reportedTraceKeys.has(key)) return;
  reportedTraceKeys.add(key);
  const payload = {
    jobId: normalizedJobId,
    stage,
    clientAt: new Date().toISOString(),
    navigationStartedMs: Math.round(performance.now()),
    ...details
  };
  console.info("图片任务前端链路", payload);
  void fetch("/api/image-jobs/client-trace", {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => undefined);
}
