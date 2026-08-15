export type SizeOption = {
  value: string;
  label: string;
  labelKey?: string;
  ratio: string;
  previewRatio?: string;
  description: string;
  descriptionKey?: string;
};

export type QualityOption = {
  value: string;
  label: string;
  labelKey?: string;
  description: string;
  descriptionKey?: string;
};

export type ImageResolutionTier = "1K" | "2K" | "4K";

export const IMAGE_RESOLUTION_TIERS: ImageResolutionTier[] = ["1K", "2K", "4K"];
export const CUSTOM_IMAGE_DIMENSION_MIN = 64;
export const CUSTOM_IMAGE_DIMENSION_MAX = 16384;

const RESOLUTION_SIZE_MAP: Record<string, Record<ImageResolutionTier, string>> = {
  "1:1": { "1K": "1024x1024", "2K": "2048x2048", "4K": "4096x4096" },
  "16:9": { "1K": "1376x768", "2K": "2752x1536", "4K": "5504x3072" },
  "9:16": { "1K": "768x1376", "2K": "1536x2752", "4K": "3072x5504" },
  "4:3": { "1K": "1200x896", "2K": "2400x1792", "4K": "4800x3584" },
  "3:4": { "1K": "896x1200", "2K": "1792x2400", "4K": "3584x4800" },
  "3:2": { "1K": "1264x848", "2K": "2528x1696", "4K": "5056x3392" },
  "2:3": { "1K": "848x1264", "2K": "1696x2528", "4K": "3392x5056" },
  "5:4": { "1K": "1152x928", "2K": "2304x1856", "4K": "4608x3712" },
  "4:5": { "1K": "928x1152", "2K": "1856x2304", "4K": "3712x4608" },
  "21:9": { "1K": "1584x672", "2K": "3168x1344", "4K": "6336x2688" },
  "8:1": { "1K": "2928x352", "2K": "5856x704", "4K": "11712x1408" },
  "4:1": { "1K": "2064x512", "2K": "4128x1024", "4K": "8256x2048" },
  "1:4": { "1K": "512x2064", "2K": "1024x4128", "4K": "2048x8256" },
  "1:8": { "1K": "352x2928", "2K": "704x5856", "4K": "1408x11712" }
};

const DEFAULT_REQUEST_SIZE = "auto";

const BASE_SIZE_OPTIONS: SizeOption[] = [
  { value: "1:1", label: "方形", labelKey: "picker.size.square", ratio: "1:1", previewRatio: "1 / 1", description: "头像、产品图、通用配图", descriptionKey: "picker.size.squareDesc" },
  { value: "16:9", label: "宽屏", labelKey: "picker.size.widescreen", ratio: "16:9", previewRatio: "16 / 9", description: "大屏横幅、演示封面", descriptionKey: "picker.size.widescreenDesc" },
  { value: "9:16", label: "故事", labelKey: "picker.size.story", ratio: "9:16", previewRatio: "9 / 16", description: "手机故事、短视频封面", descriptionKey: "picker.size.storyDesc" },
  { value: "4:3", label: "横屏", labelKey: "picker.size.landscape", ratio: "4:3", previewRatio: "4 / 3", description: "插画、横向构图", descriptionKey: "picker.size.landscapeDesc" },
  { value: "3:4", label: "竖版", labelKey: "picker.size.portrait", ratio: "3:4", previewRatio: "3 / 4", description: "海报、人物、封面", descriptionKey: "picker.size.portraitDesc" },
  { value: "3:2", label: "横图", ratio: "3:2", previewRatio: "3 / 2", description: "摄影、商品展示" },
  { value: "2:3", label: "竖图", ratio: "2:3", previewRatio: "2 / 3", description: "人物、书封与海报" },
  { value: "5:4", label: "横图", ratio: "5:4", previewRatio: "5 / 4", description: "作品展示、社交媒体" },
  { value: "4:5", label: "竖图", ratio: "4:5", previewRatio: "4 / 5", description: "社交媒体竖版配图" },
  { value: "21:9", label: "超宽屏", ratio: "21:9", previewRatio: "21 / 9", description: "电影画幅、超宽横幅" },
  { value: "8:1", label: "极宽横幅", ratio: "8:1", previewRatio: "8 / 1", description: "香蕉2 极宽长条" },
  { value: "4:1", label: "宽横幅", ratio: "4:1", previewRatio: "4 / 1", description: "香蕉2 横向长条" },
  { value: "1:4", label: "长竖幅", ratio: "1:4", previewRatio: "1 / 4", description: "香蕉2 竖向长条" },
  { value: "1:8", label: "极长竖幅", ratio: "1:8", previewRatio: "1 / 8", description: "香蕉2 极长竖条" }
];
const STANDARD_SIZE_OPTIONS = BASE_SIZE_OPTIONS.slice(0, 10);

const QUALITY_PRESETS: Record<string, { label: string; labelKey: string; descriptionKey: string }> = {
  low: { label: "低", labelKey: "picker.quality.low", descriptionKey: "picker.quality.lowDesc" },
  medium: { label: "中", labelKey: "picker.quality.medium", descriptionKey: "picker.quality.mediumDesc" },
  high: { label: "高", labelKey: "picker.quality.high", descriptionKey: "picker.quality.highDesc" }
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function sizeOptionFromValue(value: string): SizeOption {
  const preset = BASE_SIZE_OPTIONS.find((item) => item.value === value);
  if (preset) return preset;
  const ratioMatch = value.match(/^(\d+):(\d+)$/);
  if (ratioMatch) {
    const width = Number(ratioMatch[1]);
    const height = Number(ratioMatch[2]);
    return {
      value,
      label: width === height ? "方形" : width > height ? "横图" : "竖图",
      ratio: value,
      previewRatio: `${width} / ${height}`,
      description: "按分辨率档位计算最终尺寸"
    };
  }
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) {
    return { value, label: value, ratio: value, description: "自定义尺寸", descriptionKey: "picker.size.custom" };
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  const ratio = `${width / divisor}:${height / divisor}`;
  const labelKey = width === height ? "picker.size.square" : width > height ? "picker.size.landscapeImage" : "picker.size.portraitImage";
  return {
    value,
    label: width === height ? "方形" : width > height ? "横图" : "竖图",
    labelKey,
    ratio,
    previewRatio: `${width} / ${height}`,
    description: value,
    descriptionKey: "picker.size.customDimensions"
  };
}

export function customImageDimensions(value: string) {
  const match = value.trim().match(/^(\d+)x(\d+)$/i);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function customImageDimensionsError(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return "宽度和高度必须是整数";
  if (width < CUSTOM_IMAGE_DIMENSION_MIN || height < CUSTOM_IMAGE_DIMENSION_MIN) {
    return `宽度和高度不能小于 ${CUSTOM_IMAGE_DIMENSION_MIN}px`;
  }
  if (width > CUSTOM_IMAGE_DIMENSION_MAX || height > CUSTOM_IMAGE_DIMENSION_MAX) {
    return `宽度和高度不能超过 ${CUSTOM_IMAGE_DIMENSION_MAX}px`;
  }
  return "";
}

export function buildSizeOptions(configuredSizes?: string[]) {
  const normalizedSizes = unique((configuredSizes ?? []).map((value) => value.trim()).filter((value) => value !== DEFAULT_REQUEST_SIZE));
  const standardRatios = new Set(STANDARD_SIZE_OPTIONS.map((option) => option.ratio));
  const additionalOptions = normalizedSizes
    .map(sizeOptionFromValue)
    .filter((option) => !standardRatios.has(option.ratio));
  return [...STANDARD_SIZE_OPTIONS, ...additionalOptions];
}

export function requestSizeFromSelection(value: string, resolutionTier?: string, _configuredSizes: string[] = []) {
  const selected = value.trim();
  if (!selected) return DEFAULT_REQUEST_SIZE;
  if (customImageDimensions(selected)) return selected;
  const tier = IMAGE_RESOLUTION_TIERS.includes(resolutionTier as ImageResolutionTier)
    ? resolutionTier as ImageResolutionTier
    : null;
  if (!tier) return selected;
  const ratio = sizeOptionFromValue(selected).ratio;
  const requested = RESOLUTION_SIZE_MAP[ratio]?.[tier] ?? selected;
  return requested;
}

export function supportedResolutionTiers(configuredTiers: string[] = []): ImageResolutionTier[] {
  const normalized = configuredTiers.filter((tier): tier is ImageResolutionTier => IMAGE_RESOLUTION_TIERS.includes(tier as ImageResolutionTier));
  return normalized.length > 0 ? normalized : IMAGE_RESOLUTION_TIERS;
}

export function buildQualityOptions(configuredQualities: string[]): QualityOption[] {
  return unique(configuredQualities)
    .map((item) => item.trim())
    .filter((item) => item.toLowerCase() !== "auto")
    .map((value) => {
      const preset = QUALITY_PRESETS[value.toLowerCase()];
      return {
        value,
        label: preset?.label ?? value,
        labelKey: preset?.labelKey,
        description: value,
        descriptionKey: preset?.descriptionKey ?? "picker.quality.custom"
      };
    });
}
