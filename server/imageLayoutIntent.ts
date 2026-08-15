export type ImageLayoutIntent = "allow_multi_panel" | "single_composition" | "ambiguous";

const EXPLICIT_SINGLE_COMPOSITION = [
  /(?:不要|禁止|避免|拒绝).{0,10}(?:拼贴|拼图|宫格|分镜|分屏|多画面|多面板)/i,
  /(?:每张|各张|每一张).{0,10}(?:独立|单独|完整单图|单一构图)/i,
  /(?:no|without|avoid).{0,12}(?:collage|grid|multi[- ]?panel|split[- ]?screen|storyboard)/i,
  /(?:each|every) image.{0,16}(?:standalone|single composition|separate)/i
];

const EXPLICIT_MULTI_PANEL = [
  /(?:一张|单张|同一张|一个|同一).{0,12}(?:画布|图片|图像|页面|海报|长图).{0,16}(?:拼贴|拼图|宫格|分镜|分屏|多画面|多面板|多个场景)/i,
  /(?:拼贴|拼图|四宫格|九宫格|宫格布局|分镜页|漫画页|分屏布局|多面板布局|联系表|情绪板|moodboard)/i,
  /(?:single|one).{0,12}(?:canvas|image|page).{0,16}(?:collage|grid|multi[- ]?panel|split[- ]?screen|storyboard)/i,
  /(?:collage|contact sheet|storyboard page|comic page|grid layout|multi[- ]?panel layout|split[- ]?screen|diptych|triptych)/i
];

const AMBIGUOUS_MULTI_PANEL = [
  /(?:详情页|详情长图|组图|系列画面|多角度|多视角|多个场景|多个画面|同时展示|集中展示|汇总展示|完整展示)/i,
  /(?:detail page|multiple angles|multiple views|multiple scenes|showcase all|show together|visual series)/i
];

export function classifyImageLayoutIntent(prompt: string): ImageLayoutIntent {
  const normalized = String(prompt ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "single_composition";
  if (EXPLICIT_SINGLE_COMPOSITION.some((pattern) => pattern.test(normalized))) return "single_composition";
  if (EXPLICIT_MULTI_PANEL.some((pattern) => pattern.test(normalized))) return "allow_multi_panel";
  if (AMBIGUOUS_MULTI_PANEL.some((pattern) => pattern.test(normalized))) return "ambiguous";
  return "single_composition";
}
