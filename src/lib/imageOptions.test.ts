import { describe, expect, test } from "bun:test";
import { buildQualityOptions, buildSizeOptions, customImageDimensionsError, requestSizeFromSelection, supportedResolutionTiers } from "./imageOptions";

describe("image resolution size mapping", () => {
  test("only displays qualities configured by the channel", () => {
    expect(buildQualityOptions(["low", "medium"]).map((option) => option.value)).toEqual(["low", "medium"]);
  });
  const expected = {
    "1:1": ["1024x1024", "2048x2048", "4096x4096"],
    "16:9": ["1376x768", "2752x1536", "5504x3072"],
    "9:16": ["768x1376", "1536x2752", "3072x5504"],
    "4:3": ["1200x896", "2400x1792", "4800x3584"],
    "3:4": ["896x1200", "1792x2400", "3584x4800"],
    "3:2": ["1264x848", "2528x1696", "5056x3392"],
    "2:3": ["848x1264", "1696x2528", "3392x5056"],
    "5:4": ["1152x928", "2304x1856", "4608x3712"],
    "4:5": ["928x1152", "1856x2304", "3712x4608"],
    "21:9": ["1584x672", "3168x1344", "6336x2688"],
    "8:1": ["2928x352", "5856x704", "11712x1408"],
    "4:1": ["2064x512", "4128x1024", "8256x2048"],
    "1:4": ["512x2064", "1024x4128", "2048x8256"],
    "1:8": ["352x2928", "704x5856", "1408x11712"]
  } as const;

  for (const [ratio, sizes] of Object.entries(expected)) {
    test(`${ratio} maps 1K, 2K and 4K`, () => {
      expect(requestSizeFromSelection(ratio, "1K")).toBe(sizes[0]);
      expect(requestSizeFromSelection(ratio, "2K")).toBe(sizes[1]);
      expect(requestSizeFromSelection(ratio, "4K")).toBe(sizes[2]);
    });
  }

  test("keeps explicit custom pixel dimensions unchanged", () => {
    expect(requestSizeFromSelection("1536x2048", "2K")).toBe("1536x2048");
    expect(requestSizeFromSelection("2048x1152", "4K")).toBe("2048x1152");
  });

  test("validates custom pixel dimensions", () => {
    expect(customImageDimensionsError(1280, 720)).toBe("");
    expect(customImageDimensionsError(32, 720)).toContain("64px");
    expect(customImageDimensionsError(20000, 720)).toContain("16384px");
  });

  test("always keeps the ten common aspect-ratio scenarios", () => {
    expect(buildSizeOptions(["1024x1024", "1536x2048", "1152x2048", "2048x1536", "2048x1152"]).map((option) => option.ratio)).toEqual([
      "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9"
    ]);
  });

  test("appends channel-specific special ratios after the common ten", () => {
    expect(buildSizeOptions(["8:1", "1:4"]).map((option) => option.ratio)).toEqual([
      "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9", "8:1", "1:4"
    ]);
  });

  test("keeps the selected tier independent from the provider pixel size list", () => {
    expect(requestSizeFromSelection("16:9", "4K", ["1024x1024", "2048x1152", "1152x2048"])).toBe("5504x3072");
  });

  test("keeps tier mapping when provider sizes are ratio values", () => {
    expect(requestSizeFromSelection("16:9", "2K", ["1:1", "16:9", "9:16"])).toBe("2752x1536");
  });

  test("uses resolution tiers configured by the provider", () => {
    expect(supportedResolutionTiers(["1K", "2K"])).toEqual(["1K", "2K"]);
  });

  test("falls back to all tiers for legacy provider records", () => {
    expect(supportedResolutionTiers([])).toEqual(["1K", "2K", "4K"]);
  });
});
