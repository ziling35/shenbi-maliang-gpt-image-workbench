import { expect, test } from "bun:test";
import { classifyImageLayoutIntent } from "./imageLayoutIntent";

test("allows multi-panel output only for explicit same-canvas layout requests", () => {
  expect(classifyImageLayoutIntent("在同一张图片中制作四宫格产品展示")).toBe("allow_multi_panel");
  expect(classifyImageLayoutIntent("Create a collage on one canvas")).toBe("allow_multi_panel");
});

test("explicit single-image constraints override multi-panel keywords", () => {
  expect(classifyImageLayoutIntent("每张独立完整，不要拼贴或宫格")).toBe("single_composition");
});

test("routes vague multi-view wording to the model fallback", () => {
  expect(classifyImageLayoutIntent("制作商品详情页，展示多个角度和使用场景")).toBe("ambiguous");
});

test("ordinary prompts default to a single composition without model classification", () => {
  expect(classifyImageLayoutIntent("生成一张温暖的咖啡店插画")).toBe("single_composition");
});
