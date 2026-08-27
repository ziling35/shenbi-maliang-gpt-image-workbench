const PLATFORM_ALIASES = [
  [/小红书/gi, "小某书"],
  [/抖音/gi, "某音"],
  [/快手/gi, "某手"],
  [/微博/gi, "某博"],
  [/微信/gi, "微某"],
  [/淘宝/gi, "某宝"],
  [/拼多多/gi, "拼某多"],
  [/知乎/gi, "某乎"],
  [/(?:B站|哔哩哔哩)/gi, "某站"],
  [/Instagram/gi, "某图平台"],
  [/TikTok/gi, "某短视频平台"]
];

export function sanitizeLiveText(value) {
  let text = String(value ?? "");
  for (const [pattern, replacement] of PLATFORM_ALIASES) text = text.replace(pattern, replacement);
  return text;
}
