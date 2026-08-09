import { expect, test } from "bun:test";
import {
  requestedImageCountFromPayload,
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

test("calculates supplemental attempts from missing images and retry count", () => {
  expect(requestedImageCountFromPayload({ n: 3 })).toBe(3);
  expect(supplementalImageRequestBudget(3, 1, 0)).toBe(2);
  expect(supplementalImageRequestBudget(3, 1, 1)).toBe(4);
  expect(supplementalImageRequestBudget(3, 3, 2)).toBe(0);
});
