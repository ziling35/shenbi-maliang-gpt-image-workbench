import { expect, test } from "bun:test";
import {
  requestedImageCountFromPayload,
  singleImageVariantPayload,
  singleImageSupplementPayload,
  supplementalImageRequestBudget
} from "./imageRequestSupplement";

test("builds a clean n=1 supplemental image request", () => {
  const payload = singleImageSupplementPayload({
    prompt: "生成森林插画\n\n数量由接口参数 n=3 控制。请把每个结果都生成成一张独立完整的单图，不要在单张图片中做四宫格、拼贴、分屏或多张图片排版。",
    size: "1024x1024",
    quality: "high",
    n: 3
  });
  expect(payload.prompt).toBe("生成森林插画");
  expect(payload.size).toBe("1024x1024");
  expect(payload.quality).toBe("high");
  expect(payload.n).toBe(1);
});

test("keeps ordinary prompts unchanged for supplemental requests", () => {
  expect(singleImageSupplementPayload({ prompt: "生成一张猫咪图片", n: 4 })).toEqual({ prompt: "生成一张猫咪图片", n: 1 });
});

test("removes the multi-image instruction before a trailing edit constraint", () => {
  const payload = singleImageSupplementPayload({
    prompt: "修改海报\n\n数量由接口参数 n=3 控制。请把每个结果都生成成一张独立完整的单图，不要在单张图片中做四宫格、拼贴、分屏或多张图片排版。\n\n严格只在遮罩选区内修改。",
    n: 3
  });
  expect(payload.prompt).toBe("修改海报\n\n严格只在遮罩选区内修改。");
});

test("builds indexed single-image prompts without leaking batch quantity into the composition", () => {
  const payload = singleImageVariantPayload({
    prompt: "制作产品视觉，包含主视觉、细节、使用场景、包装和参数展示",
    n: 5
  }, 3, 5);
  expect(payload.n).toBe(1);
  expect(String(payload.prompt)).toContain("第 3/5 张结果");
  expect(String(payload.prompt)).toContain("只执行其中第 3 项");
  expect(String(payload.prompt)).toContain("不要制作汇总式商品详情页");
  expect(String(payload.prompt)).not.toContain("接口参数 n=5");
});

test("gives each independent image request a distinct variation direction", () => {
  const prompts = Array.from({ length: 5 }, (_, index) => String(singleImageVariantPayload({ prompt: "生成产品海报", n: 5 }, index + 1, 5).prompt));
  expect(new Set(prompts).size).toBe(5);
  expect(prompts.every((prompt) => prompt.includes("只输出一张独立完整的图片"))).toBe(true);
});

test("preserves an explicitly approved multi-panel layout", () => {
  const payload = singleImageVariantPayload({ prompt: "在同一张图片中制作四宫格产品展示", n: 3 }, 2, 3, { allowMultiPanel: true });
  expect(String(payload.prompt)).toContain("请保留这个布局意图");
  expect(String(payload.prompt)).not.toContain("严格禁止在一张图里组合多个方案");
});

test("calculates supplemental attempts from missing images and retry count", () => {
  expect(requestedImageCountFromPayload({ n: 3 })).toBe(3);
  expect(supplementalImageRequestBudget(3, 1, 0)).toBe(2);
  expect(supplementalImageRequestBudget(3, 1, 1)).toBe(4);
  expect(supplementalImageRequestBudget(3, 3, 2)).toBe(0);
});
