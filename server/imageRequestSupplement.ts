const MULTI_IMAGE_PROMPT_INSTRUCTION = /\n\n数量由接口参数 n=\d+ 控制。请把每个结果都生成成一张独立完整的单图，不要在单张图片中做四宫格、拼贴、分屏或多张图片排版。(?=\n\n|\s*$)/g;

export function requestedImageCountFromPayload(payload: Record<string, unknown>) {
  const count = Number(payload.n);
  return Number.isFinite(count) && count > 0 ? Math.max(1, Math.trunc(count)) : 1;
}

export function singleImageSupplementPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const prompt = String(payload.prompt ?? "").replace(MULTI_IMAGE_PROMPT_INSTRUCTION, "").trim();
  return {
    ...payload,
    n: 1,
    ...(prompt ? { prompt } : {})
  };
}

export function supplementalImageRequestBudget(requestedCount: number, receivedCount: number, retryCount: number) {
  const missingCount = Math.max(0, Math.trunc(requestedCount) - Math.max(0, Math.trunc(receivedCount)));
  return missingCount * (Math.max(0, Math.trunc(retryCount)) + 1);
}
