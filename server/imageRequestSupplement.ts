const MULTI_IMAGE_PROMPT_INSTRUCTION = /\n\n数量由接口参数 n=\d+ 控制。请把每个结果都生成成一张独立完整的单图，不要在单张图片中做四宫格、拼贴、分屏或多张图片排版。(?=\n\n|\s*$)/g;

const VARIANT_DIRECTIONS = [
  "优先完成最核心、最具有代表性的主视觉方案。",
  "使用明显不同的视角、机位或构图，但保持主体与核心设计一致。",
  "使用不同的环境、场景或叙事方式，避免重复上一张的画面结构。",
  "使用不同的光线、色彩氛围或视觉节奏，形成清晰可辨的独立方案。",
  "给出更有创意但仍符合原始需求的变化方案，避免与其他结果近似。"
];

function cleanBatchInstruction(prompt: unknown) {
  return String(prompt ?? "").replace(MULTI_IMAGE_PROMPT_INSTRUCTION, "").trim();
}

export function requestedImageCountFromPayload(payload: Record<string, unknown>) {
  const count = Number(payload.n);
  return Number.isFinite(count) && count > 0 ? Math.max(1, Math.trunc(count)) : 1;
}

export function singleImageSupplementPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const prompt = cleanBatchInstruction(payload.prompt);
  return {
    ...payload,
    n: 1,
    ...(prompt ? { prompt } : {})
  };
}

export function singleImageVariantPayload(
  payload: Record<string, unknown>,
  imageIndex: number,
  requestedImageCount: number,
  options: { allowMultiPanel?: boolean } = {}
): Record<string, unknown> {
  const prompt = cleanBatchInstruction(payload.prompt);
  const total = Math.max(1, Math.trunc(Number(requestedImageCount) || 1));
  const index = Math.min(total, Math.max(1, Math.trunc(Number(imageIndex) || 1)));
  if (total <= 1) return { ...payload, n: 1, ...(prompt ? { prompt } : {}) };
  const direction = VARIANT_DIRECTIONS[(index - 1) % VARIANT_DIRECTIONS.length];
  const variantInstruction = options.allowMultiPanel
    ? [
        `本次请求只生成第 ${index}/${total} 个独立结果。`,
        "用户已经明确要求最终图片本身采用拼贴、宫格、分镜、分屏或多面板布局，请保留这个布局意图，但只输出一张图片。",
        direction
      ].join("\n")
    : [
        `本次请求只生成第 ${index}/${total} 张结果，并且只输出一张独立完整的图片。`,
        `如果原始提示中列出了 ${total} 个方案、画面、视角、场景或编号要求，只执行其中第 ${index} 项，不要把其他项目放进同一张图片。`,
        "即使原始提示同时包含多个卖点、细节、视角或使用场景，也只选择一个主要视觉重点，用单一场景和单一构图表达，不要制作汇总式商品详情页。",
        "严格禁止在一张图里组合多个方案、多个场景或多个编号画面，也不要生成拼贴、宫格、分镜、分屏或多面板布局。",
        direction
      ].join("\n");
  return {
    ...payload,
    n: 1,
    prompt: [prompt, variantInstruction].filter(Boolean).join("\n\n")
  };
}

export function supplementalImageRequestBudget(requestedCount: number, receivedCount: number, retryCount: number) {
  const missingCount = Math.max(0, Math.trunc(requestedCount) - Math.max(0, Math.trunc(receivedCount)));
  return missingCount * (Math.max(0, Math.trunc(retryCount)) + 1);
}
