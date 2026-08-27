const state = {
  config: {}, events: [], voiceEnabled: false, speaking: false, speechQueue: [],
  slideIndex: 0, cycle: 1, welcomedUsers: new Set(), lastWelcomeAt: 0, voices: [], currentAudio: null,
  realDemoReady: false, realDemoTimer: null, sceneSpeechCache: new Map(), sceneRequests: new Map(), audioCache: new Map(), audioRequests: new Map(), sceneBundleRequests: new Map(), prefetchChain: Promise.resolve(), autoTourStarted: false, tourId: 0,
  liveDirector: { running: false, phase: "idle", runId: 0, lastJobId: "", lastImageId: "", editCount: 0, generationSeen: false, lastPlatformState: null, lastNarrationAt: 0, narrationPending: new Set(), heartbeat: null }
};
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const slides = [
  { key: "portraitEdit", chapter: "01 · 对话改图", tab: "人物改图", title: "一句话连续改图，不必反复重做", desc: "上传原图后直接描述要求，人物、构图和风格可以连续迭代。", status: "解决问题：改图门槛高、沟通轮次多", ticker: "生图、改图、续改和素材管理都在同一个工作台。", fallback: "灵图AI不只是生成一张图片，更重要的是可以围绕同一张图连续修改。发型、服装、光影、构图和局部细节都能直接用中文说明，不需要学习复杂软件，也不用每次从头开始。它解决的是修改次数多、沟通成本高、多个工具来回切换的问题。目前平台可以免费试用，关注后即可领取试用入口。" },
  { key: "emotionPortrait", chapter: "02 · 人像强化", tab: "情绪人像", title: "保留人物特征，增强情绪与电影感", desc: "强化眼神、泪痕、花瓣、光影和皮肤质感。", status: "案例：普通人像升级为电影感视觉", ticker: "适合写真、短视频封面与宣传视觉。", fallback: "这个案例解决的是人物清楚，但情绪不够、画面不抓人的问题。灵图AI可以保留人物特征，再补充眼神高光、自然泪痕、花瓣层次和电影感光影，让画面更适合写真封面、短视频封面和宣传视觉。需要更细腻的皮肤与发丝可以选择二K，当前二K一张只要两分钱。平台目前免费试用，关注后就可以亲自测试。" },
  { key: "compositionExpand", chapter: "03 · 构图扩展", tab: "扩图构图", title: "主体不变，重新安排景别与留白", desc: "把近景扩展为完整竖版构图，补足环境和氛围。", status: "案例：解决尺寸不合适与构图太挤", ticker: "一张素材继续适配海报、封面和不同平台比例。", fallback: "很多图片内容不错，却因为比例不对、主体太满，无法直接用于海报或竖版封面。灵图AI可以保留主体和原有风格，向外扩展环境，重新安排人物位置、留白和视觉动线。这样一张素材就能适配内容平台封面、短视频竖图和商业海报。二K一张只要两分钱，当前还可以免费试用，关注后即可领取。" },
  { key: "wuxiaRestyle", chapter: "04 · 风格改造", tab: "国风武侠", title: "真人素材快速改造成国风武侠视觉", desc: "保留五官辨识度，重做服装、背景、道具和气质。", status: "案例：低成本完成角色定妆与内容包装", ticker: "适合国风账号、短剧角色、游戏宣传与个人写真。", fallback: "这个国风武侠案例解决的是缺少服装、场景和专业拍摄条件的问题。只要有一张清晰人物图，就能保留五官辨识度，再把服装、发型、兵器、山水背景和水墨氛围统一重构。过去需要摄影、造型和后期配合的角色视觉，现在可以快速得到多个方向。需要成片细节时选四K，一张只要九分钱，目前关注后还能免费试用。" },
  { key: "styleExtension", chapter: "05 · 风格延展", tab: "参考延展", title: "参考一张图，延展同系列视觉", desc: "延续色彩、材质和世界观，生成新的构图与人物场景。", status: "案例：解决系列素材风格不统一", ticker: "适合品牌内容、角色系列、海报组图和故事视觉。", fallback: "做系列内容最难的是每张图风格容易跑偏。灵图AI可以参考已有图片的色彩、材质、灯光和世界观，再延展新的构图与场景，让多张素材保持统一。这个能力适合品牌海报组图、角色系列、小说配图和短剧概念视觉。二K只要两分钱，四K只要九分钱，当前平台免费试用，关注后可以直接体验。" },
  { key: "outfitChange", chapter: "06 · 模特换装", tab: "模特换装", title: "保留模特与场景，一句话更换服装", desc: "减少重复拍摄，快速验证颜色、款式和搭配方向。", status: "解决问题：服装上新拍摄成本高", ticker: "适合服装电商、穿搭账号和款式预览。", fallback: "服装商家经常需要同一模特展示多种颜色和款式，重复拍摄成本很高。灵图AI可以尽量保留人物、姿态和场景，只修改服装设计、颜色与面料质感，快速制作上新预览和内容素材。修改不满意还可以继续对话，不用重新开始。当前可以免费试用，关注后即可领取入口。" },
  { key: "quality4k", chapter: "07 · 清晰度价格", tab: "2K / 4K", title: "高清生成价格透明，二K两分、四K九分", desc: "生成前可选模型、比例、质量和数量，并直接看到费用。", status: "价格优势：2K ¥0.02 · 4K ¥0.09", ticker: "试效果用2K，成片细节用4K，成本低且可控。", fallback: "灵图AI把模型、比例、清晰度、数量和费用放在同一个操作区，生成前就能看清楚。当前二K一张只要两分钱，适合日常出图和批量尝试；四K一张只要九分钱，适合需要发丝、材质和商品细节的成片。价格足够低，可以放心多尝试几个方向。目前平台正在免费试用，关注后即可领取使用入口。" },
  { key: "productDetail", chapter: "08 · 电商素材", tab: "商品详情", title: "一套商品图，延展主图、详情与营销素材", desc: "统一包装、卖点、背景和展示角度，减少外包与返工。", status: "解决问题：电商素材多、制作周期长", ticker: "适合内容电商、私域商品和新品测试。", fallback: "电商商家需要的不只是一张主图，还包括详情页、包装展示、卖点图和活动素材。灵图AI可以围绕同一商品连续生成和修改，让视觉风格保持统一，也减少不同设计师之间的反复沟通。二K只要两分钱，批量测试方案的成本非常低。当前免费试用，关注后可以直接体验完整流程。" },
  { key: "localEdit", chapter: "09 · 局部修改", tab: "局部涂抹", title: "只改不满意的位置，其余内容尽量保留", desc: "圈选局部后替换文字、元素、材质或细节。", status: "解决问题：小修改却要整图重做", ticker: "包装、人物和产品细节都能定点修改。", fallback: "很多设计已经完成百分之九十，只因为一个局部不合适就整张重做，非常浪费时间。灵图AI支持圈出需要调整的位置，只修改文字、装饰、服装、产品细节或背景元素，其余区域尽量保持不变。这样更适合真实项目里的多轮修改。平台目前免费试用，关注后即可领取入口。" },
  { key: "gallery", chapter: "10 · 作品管理", tab: "我的图片", title: "生成、改图和下载记录集中管理", desc: "作品自动保存，可收藏、下载、再次编辑和批量整理。", status: "解决问题：素材散落、版本难找", ticker: "从创作到管理都在一个平台完成。", fallback: "灵图AI会把生成和修改结果集中保存，不需要在多个网站、聊天窗口和文件夹里反复寻找。人物、电商、海报和产品素材都可以收藏、下载、再次编辑和管理历史版本。它解决的是创作完成以后素材仍然混乱的问题。当前平台免费试用，关注后可以领取完整使用入口。" },
  { key: "promptSystem", chapter: "11 · 提示词助手", tab: "提示词助手", title: "不会写提示词，也能把业务需求变成专业指令", desc: "按用途填写信息，由系统整理主体、场景、灯光、构图和材质。", status: "解决问题：有想法但不会准确表达", ticker: "从需求整理、生成、修改到管理形成完整工作流。", fallback: "很多人不是没有创意，而是不知道怎样把需求写成模型能理解的提示词。灵图AI提供结构化提示词助手，把用途、主题、受众、色彩、构图和材质整理成可直接使用的专业指令，再进入生成和连续改图。这样新手也能稳定完成商业素材。目前平台免费试用，二K两分钱、四K九分钱，关注后即可领取入口开始体验。" }
];
const liveDemoActions = {
  portraitEdit: { feature: "portraitEdit", prompt: "生成一张高级自然光人像摄影，人物主体清晰，皮肤质感自然，背景干净，电影感构图", size: "3:4", resolutionTier: "2K", imageCount: 1 },
  emotionPortrait: { feature: "portraitEdit", prompt: "保留人物身份特征，强化眼神高光与克制泪痕，加入花瓣和玫瑰环境，细化发丝与皮肤质感，形成高级电影感情绪人像", size: "3:4", resolutionTier: "2K", imageCount: 1 },
  compositionExpand: { feature: "portraitEdit", prompt: "保留人物和暗调花园风格，将近景扩展为完整竖版构图，补足环境、花瓣、玫瑰与留白，适合海报和短视频封面", size: "2:3", resolutionTier: "2K", imageCount: 1 },
  wuxiaRestyle: { feature: "portraitEdit", prompt: "保留人物五官辨识度，改造成东方武侠女侠，黑色刺绣服装，长发玉簪，手持长剑，水墨山水背景，真实摄影质感", size: "2:3", resolutionTier: "2K", imageCount: 1 },
  styleExtension: { feature: "portraitEdit", prompt: "参考暗金机械建筑、红色长裙、逆光与史诗氛围，延展同一世界观，生成新的全身人物构图，细化服装与建筑纹理", size: "2:3", resolutionTier: "4K", imageCount: 1 },
  outfitChange: { prompt: "生成一张时尚女装模特展示图，保留自然人物比例，服装面料细节清晰，商业棚拍光线", size: "3:4", resolutionTier: "1K", imageCount: 1 },
  quality4k: { prompt: "生成一张极致细节的未来科技产品广告图，金属材质，蓝紫色灯光，高级商业视觉", size: "16:9", resolutionTier: "4K", imageCount: 1 },
  productDetail: { prompt: "生成一张高端护肤品电商主图，产品居中，柔和水波与植物元素，干净高级，可用于商品详情页", size: "4:5", resolutionTier: "1K", imageCount: 1 },
  localEdit: { prompt: "把选中区域替换成精致的金色装饰元素，保持原图光影、透视和整体风格一致", resolutionTier: "1K", imageCount: 1 },
  gallery: { prompt: "展示并讲解生成作品的收藏、下载、再次编辑和历史记录管理", imageCount: 1 },
  promptSystem: { prompt: "为一款国风茶饮品牌生成完整商业海报提示词，包含主体、场景、灯光、构图、材质和文字排版要求", imageCount: 1 }
};

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char]); }
function sanitizeLiveText(value) { return String(value ?? "").replace(/小红书/gi, "小某书").replace(/抖音/gi, "某音").replace(/快手/gi, "某手").replace(/微博/gi, "某博").replace(/微信/gi, "微某").replace(/淘宝/gi, "某宝").replace(/拼多多/gi, "拼某多").replace(/知乎/gi, "某乎").replace(/B站|哔哩哔哩/gi, "某站").replace(/Instagram/gi, "某图平台").replace(/TikTok/gi, "某短视频平台"); }
function showToast(text) { const node = $("#toast"); node.textContent = text; node.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => node.classList.remove("show"), 2600); }
function updateClock() { $("#clock").textContent = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); }
function loadVoices() { state.voices = window.speechSynthesis?.getVoices?.() || []; }
function preferredVoice() { const mandarinVoices = state.voices.filter(voice => /^zh[-_]CN$/i.test(voice.lang)); const chineseVoices = state.voices.filter(voice => /^zh/i.test(voice.lang) && !/^zh[-_](HK|TW|MO)$/i.test(voice.lang)); const voices = mandarinVoices.length ? mandarinVoices : chineseVoices; const names = ["Xiaoxiao", "Xiaoyi", "Yunxi", "Yunyang", "晓晓", "晓伊", "云希", "云扬", "Huihui", "Kangkang", "Yaoyao", "Natural"]; return voices.find(voice => names.some(name => voice.name.includes(name))) || voices[0] || null; }
function splitSpeech(value) { const text = String(value || "").replace(/\s+/g, " ").trim(); if (!text) return []; if (text.length <= 240) return [text]; const sentences = text.match(/[^。！？!?]+[。！？!?]?/g) || [text]; const chunks = []; let current = ""; for (const sentence of sentences) { if (current && current.length + sentence.length > 240) { chunks.push(current.trim()); current = ""; } if (sentence.length > 240) { if (current.trim()) chunks.push(current.trim()); current = ""; for (let offset = 0; offset < sentence.length; offset += 220) chunks.push(sentence.slice(offset, offset + 220).trim()); } else current += sentence; } if (current.trim()) chunks.push(current.trim()); return chunks.filter(Boolean); }
function enqueueSpeech(lines, { priority = false, onComplete = null, audioKey = "" } = {}) {
  if (!state.voiceEnabled) return;
  const source = Array.isArray(lines) ? lines.join(" ") : String(lines || "");
  const texts = splitSpeech(source);
  const items = texts.map((text, index) => ({ text, audioKey: audioKey ? `${audioKey}:${index}` : "", onComplete: index === texts.length - 1 ? onComplete : null }));
  if (priority) state.speechQueue.unshift(...items); else state.speechQueue.push(...items);
  if (!state.speaking) void speakNext();
}
function browserSpeak(text) { return new Promise(resolve => { if (!("speechSynthesis" in window)) return resolve(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = "zh-CN"; utterance.voice = preferredVoice(); utterance.rate = 1.12; utterance.pitch = 1; utterance.volume = .94; utterance.onend = resolve; utterance.onerror = resolve; window.speechSynthesis.speak(utterance); }); }
async function prepareCloudAudio(text, cacheKey = "") {
  if (state.config.tts?.active === "browser") return null;
  const cached = cacheKey ? state.audioCache.get(cacheKey) : null;
  if (cached?.text === text) return cached.url;
  if (cacheKey && state.audioRequests.has(cacheKey)) return state.audioRequests.get(cacheKey);
  const request = (async () => {
    const response = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, provider: state.config.tts?.active }) });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "云语音合成失败");
    if (contentType.includes("json")) return null;
    const url = URL.createObjectURL(await response.blob());
    if (cacheKey) state.audioCache.set(cacheKey, { text, url });
    return url;
  })();
  if (cacheKey) state.audioRequests.set(cacheKey, request);
  try { return await request; } finally { if (cacheKey) state.audioRequests.delete(cacheKey); }
}
async function cloudSpeak(text, cacheKey = "") {
  const audioPromise = prepareCloudAudio(text, cacheKey);
  const url = await Promise.race([audioPromise, sleep(20000).then(() => null)]);
  if (!url && cacheKey) audioPromise.catch(error => reportClientLog("client.tts.background-prefetch", error, { cacheKey, textLength: text.length }));
  if (!url) return false;
  try { await new Promise(resolve => { const audio = new Audio(url); state.currentAudio = audio; audio.onended = resolve; audio.onerror = resolve; audio.play().catch(resolve); }); }
  finally { state.currentAudio = null; if (!cacheKey) URL.revokeObjectURL(url); }
  return true;
}
async function prepareSpeechAudio(text, baseKey) {
  if (state.config.tts?.active === "browser") return;
  await Promise.all(splitSpeech(text).map((chunk, index) => prepareCloudAudio(chunk, `${baseKey}:${index}`)));
}
async function speakNext() {
  const item = state.speechQueue.shift();
  if (!item || !state.voiceEnabled) { state.speaking = false; return; }
  state.speaking = true;
  try { const usedCloud = state.config.tts?.active !== "browser" && await cloudSpeak(item.text, item.audioKey || ""); if (!usedCloud) await browserSpeak(item.text); }
  catch (error) { reportClientLog("client.tts.play", error, { textLength: item.text.length }); console.warn(error); await browserSpeak(item.text); }
  try { item.onComplete?.(); } catch (error) { console.warn(error); }
  void speakNext();
}
function stopSpeech() { state.speechQueue = []; state.speaking = false; state.currentAudio?.pause(); state.currentAudio = null; for (const cached of state.audioCache.values()) URL.revokeObjectURL(cached.url); state.audioCache.clear(); state.audioRequests.clear(); window.speechSynthesis?.cancel(); }
function setVoiceState(enabled) { state.voiceEnabled = enabled; const label = state.config.tts?.voice || "浏览器中文语音"; $("#voiceState").textContent = enabled ? `${label} · AI连续讲解` : "当前为静音演示"; $("#toggleVoice").textContent = enabled ? "暂停讲解" : "开启讲解"; }
function sceneCacheKey(index, cycle = state.cycle) { return `${cycle}:${slides[(index + slides.length) % slides.length].key}`; }
function transitionCacheKey(index) { return `transition:${slides[(index + slides.length) % slides.length].key}`; }
function transitionText(index) {
  const slide = slides[(index + slides.length) % slides.length];
  const transitions = {
    portraitEdit: "先看灵图AI的连续改图。一张原图可以反复调整人物、构图和细节，省掉重做与多工具切换的时间，目前关注后可以免费试用。",
    emotionPortrait: "现在展示情绪人像强化。它能在保留人物特征的基础上增强眼神、光影和画面氛围，二K一张只要两分钱。",
    compositionExpand: "接着看构图扩展。比例不合适、主体太挤的图片，可以补足环境与留白，继续适配海报和竖版封面。",
    wuxiaRestyle: "下面是国风武侠改造。没有专业服装和场景，也能把真人素材快速包装成角色定妆视觉，四K一张只要九分钱。",
    styleExtension: "现在看参考风格延展。系统会延续原图的色彩、材质和世界观，帮助品牌与内容创作者稳定制作系列素材。",
    outfitChange: "接着看模特换装。这个功能特别适合服装、电商和内容创作者，保留人物与场景，再用自然语言快速尝试新的穿搭方向。",
    quality4k: "现在切到生成参数区域。大家重点看模型、画面比例和一K、二K、四K这些档位，实际使用时可以按速度、细节和预算灵活选择。",
    productDetail: "接下来是很多商家关心的商品详情图。主图、包装展示和营销素材可以在同一套工作流里持续生成和修改。",
    localEdit: "下面看局部编辑。整张图已经满意时，不需要推倒重来，只圈出有问题的位置，再告诉灵图AI需要替换或修正什么。",
    gallery: "这一页是作品管理。前面生成和修改过的图片都会集中保存，后续查找、下载、收藏和继续编辑会方便很多。",
    promptSystem: "最后看提示词系统。不会写复杂提示词也没关系，可以按实际用途填写需求，再让文字模型帮助整理成更完整的创作指令。"
  };
  return transitions[slide.key] || `好，我们继续看${slide.tab}。灵图AI目前开放免费试用，关注后即可领取体验入口。`;
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function reportClientLog(type, error, details = {}) { fetch("/api/client-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, ok: false, error: String(error?.message || error || "未知错误"), details }), keepalive: true }).catch(() => {}); }
function reportClientMetric(type, details = {}) { fetch("/api/client-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, ok: true, details }), keepalive: true }).catch(() => {}); }
function pruneAudioCache(limit = 28) {
  if (state.audioCache.size <= limit) return;
  const removable = [...state.audioCache.keys()].slice(0, state.audioCache.size - limit);
  for (const key of removable) { const cached = state.audioCache.get(key); if (cached?.url) URL.revokeObjectURL(cached.url); state.audioCache.delete(key); }
}
async function generateSceneSpeech(index, cycle = state.cycle) {
  const normalizedIndex = (index + slides.length) % slides.length;
  const slide = slides[normalizedIndex];
  const key = sceneCacheKey(normalizedIndex, cycle);
  if (state.sceneSpeechCache.has(key)) return state.sceneSpeechCache.get(key);
  if (state.sceneRequests.has(key)) return state.sceneRequests.get(key);
  const nextSlide = slides[(normalizedIndex + 1) % slides.length];
  const request = (async () => {
    if (!state.config.ai?.enabled) { state.sceneSpeechCache.set(key, slide.fallback); return slide.fallback; }
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 22000);
        const response = await fetch("/api/director/scene", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sceneKey: slide.key, nextSceneKey: nextSlide.key, cycle }), signal: controller.signal }).finally(() => window.clearTimeout(timeout));
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.text) { state.sceneSpeechCache.set(key, result.text); return result.text; }
        if (response.status < 500) break;
        await sleep(800);
      }
      return slide.fallback;
    } catch { return slide.fallback; }
    finally { state.sceneRequests.delete(key); }
  })();
  state.sceneRequests.set(key, request);
  return request;
}
async function prepareSceneBundle(index, cycle = state.cycle) {
  const normalizedIndex = (index + slides.length) % slides.length;
  const key = sceneCacheKey(normalizedIndex, cycle);
  if (state.sceneBundleRequests.has(key)) return state.sceneBundleRequests.get(key);
  const request = (async () => {
    const startedAt = performance.now();
    const aiSpeechPromise = generateSceneSpeech(normalizedIndex, cycle);
    const transition = transitionText(normalizedIndex);
    const transitionAudioPromise = prepareSpeechAudio(transition, transitionCacheKey(normalizedIndex));
    const speech = await Promise.race([aiSpeechPromise, sleep(5500).then(() => slides[normalizedIndex].fallback)]);
    if (speech === slides[normalizedIndex].fallback) aiSpeechPromise.then(async aiSpeech => {
      if (aiSpeech && aiSpeech !== slides[normalizedIndex].fallback) {
        state.sceneSpeechCache.set(key, aiSpeech);
        try { await prepareSpeechAudio(aiSpeech, key); } catch {}
      }
    }).catch(() => undefined);
    void Promise.allSettled([prepareSpeechAudio(speech, key), transitionAudioPromise]).then(results => {
      const rejected = results.find(result => result.status === "rejected");
      if (rejected?.status === "rejected") reportClientLog("client.tts.prefetch", rejected.reason, { sceneKey: slides[normalizedIndex].key, cycle });
      pruneAudioCache();
    });
    reportClientMetric("client.scene.bundle-ready", { sceneKey: slides[normalizedIndex].key, cycle, durationMs: Math.round(performance.now() - startedAt), chunks: splitSpeech(speech).length });
    return { speech, audioKey: key };
  })();
  state.sceneBundleRequests.set(key, request);
  try { return await request; } finally { state.sceneBundleRequests.delete(key); }
}
function prefetchScenes(fromIndex = state.slideIndex, cycle = state.cycle, count = 3) {
  if (!state.voiceEnabled || document.visibilityState !== "visible") return;
  const tasks = Array.from({ length: count }, (_, offset) => {
    const absoluteIndex = fromIndex + offset;
    const index = absoluteIndex % slides.length;
    const targetCycle = cycle + Math.floor(absoluteIndex / slides.length);
    return prepareSceneBundle(index, targetCycle);
  });
  state.prefetchChain = Promise.allSettled(tasks).catch(error => console.warn("讲稿预生成失败", error));
}
function updateSlide(index) {
  state.slideIndex = (index + slides.length) % slides.length;
  const slide = slides[state.slideIndex];
  $$("#screenshotFallback .screen-slide").forEach((node, nodeIndex) => node.classList.toggle("active", nodeIndex === state.slideIndex));
  $$("#stageTabs button").forEach((node, nodeIndex) => node.classList.toggle("active", nodeIndex === state.slideIndex));
  $$(".feature-list article").forEach((node, nodeIndex) => node.classList.toggle("active", nodeIndex === state.slideIndex));
  const nextSlide = slides[(state.slideIndex + 1) % slides.length];
  $("#chapterLabel").textContent = slide.chapter; $("#headline").textContent = slide.title; $("#subline").textContent = slide.desc; $("#stageStatus").textContent = slide.status; $("#tickerText").textContent = slide.ticker;
  $("#retentionTitle").textContent = slide.title; $("#screenCueTitle").textContent = slide.tab; $("#sidebarCurrentScene").textContent = slide.tab; $("#sidebarNextScene").textContent = `下一页：${nextSlide.tab}`;
  const progress = $("#narrationProgress"); progress.classList.remove("playing"); void progress.offsetWidth; progress.classList.add("playing");
}
async function playScene(index, cycle = state.cycle, announceTransition = false) {
  const startedAt = performance.now();
  const tourId = state.tourId;
  updateSlide(index);
  state.cycle = cycle;
  if (announceTransition && state.voiceEnabled) enqueueSpeech(transitionText(index), { audioKey: transitionCacheKey(index) });
  const nextIndex = (index + 1) % slides.length;
  const nextCycle = cycle + (nextIndex === 0 ? 1 : 0);
  const currentBundlePromise = prepareSceneBundle(index, cycle);
  prefetchScenes(nextIndex, nextCycle, 3);
  const bundle = await currentBundlePromise;
  reportClientMetric("client.scene.play-ready", { sceneKey: slides[index].key, cycle, waitMs: Math.round(performance.now() - startedAt), prefetched: state.audioCache.has(`${bundle.audioKey}:0`) });
  if (tourId !== state.tourId || !state.voiceEnabled) return;
  const { speech, audioKey: currentAudioKey } = bundle;
  if (!state.voiceEnabled) return;
  enqueueSpeech(speech, { audioKey: currentAudioKey, onComplete: () => {
    if (tourId === state.tourId && state.voiceEnabled) void playScene(nextIndex, nextCycle, true);
  } });
}
function enableVoice() { stopSpeech(); state.tourId += 1; setVoiceState(true); $("#voiceGate")?.remove(); showToast(`${state.config.tts?.voice || "自然语音"}已开启，后续三页正在并行备稿`); state.autoTourStarted = true; const intro = "欢迎来到灵图AI直播间。这里会通过真实案例，介绍它怎样解决人物改图、构图扩展、风格改造、电商素材和提示词表达这些实际问题。平台目前开放免费试用，二K一张只要两分钱，四K一张只要九分钱。先点关注，稍后就可以领取试用入口，我们现在开始。"; prefetchScenes(state.slideIndex, state.cycle, 3); enqueueSpeech(intro, { onComplete: () => void playScene(state.slideIndex, state.cycle) }); }
function toggleVoice() { if (state.voiceEnabled) { state.tourId += 1; setVoiceState(false); stopSpeech(); showToast("讲解已暂停"); } else { state.tourId += 1; setVoiceState(true); showToast("AI连续讲解已恢复，正在并行准备后续页面"); state.autoTourStarted = true; prefetchScenes(state.slideIndex, state.cycle, 3); void playScene(state.slideIndex, state.cycle); } }
function eventIcon(type) { return ({ chat: "聊", member: "来", gift: "礼", like: "赞", social: "关", fansclub: "团", emoji: "聊" })[type] || "播"; }
function eventLabel(type) { return ({ chat: "弹幕", member: "进场", gift: "礼物", like: "点赞", social: "关注", fansclub: "粉丝团", stats: "数据" })[type] || "互动"; }
function showAudiencePop(label, text) { const node = $("#audiencePop"); $("#audiencePopLabel").textContent = label; $("#audiencePopText").textContent = text; node.classList.add("show"); clearTimeout(showAudiencePop.timer); showAudiencePop.timer = setTimeout(() => node.classList.remove("show"), 4200); }
function addEvent(event) { const normalized = { type: event.type || "chat", user: sanitizeLiveText(String(event.user || "直播间朋友")).slice(0, 20), text: sanitizeLiveText(String(event.text || "")).slice(0, 120) }; if (!normalized.text) return; state.events.push(normalized); state.events = state.events.slice(-6); $("#chatList").innerHTML = state.events.map(item => `<div class="chat-line event-${escapeHtml(item.type)}"><div class="avatar">${eventIcon(item.type)}</div><div><small>${eventLabel(item.type)}</small><b>${escapeHtml(item.user)}</b><span>${escapeHtml(item.text)}</span></div></div>`).join(""); if (normalized.type === "member") showAudiencePop("欢迎进入直播间", `${normalized.user}，平台目前免费试用，先关注即可领取入口`); if (normalized.type === "social") showAudiencePop("感谢关注", `${normalized.user}，已为你保留免费试用入口`); if (normalized.type === "gift") showAudiencePop("感谢支持", `${normalized.user}，谢谢你的礼物`); }
function handleDirector(payload) { if (!payload?.text) return; const safeText = sanitizeLiveText(payload.text); const safeUser = sanitizeLiveText(payload.user || ""); $("#tickerText").textContent = safeText; if (payload.kind === "welcome") showAudiencePop("正在欢迎新朋友", safeText); enqueueSpeech(safeText, { priority: payload.kind === "reply" || payload.kind === "welcome" }); showToast(payload.kind === "reply" ? `正在回答 ${safeUser || "观众"}` : payload.kind === "welcome" ? `正在欢迎 ${safeUser || "新观众"}` : "AI 导播已更新讲解"); }
function postPlatformAction(payload) { if (!state.realDemoReady || String(state.config.platformDemoMode || "slides").toLowerCase() !== "real") return; const frame = $("#platformDemoFrame"); if (!frame?.contentWindow) return; try { frame.contentWindow.postMessage({ source: "lingtu-live-director", ...payload }, new URL(state.config.platformDemoUrl || state.config.platformUrl).origin); } catch {} }
function sendCurrentDemoAction(generate = false) { const slide = slides[state.slideIndex]; const action = liveDemoActions[slide.key] || {}; const feature = action.feature || slide.key; postPlatformAction({ type: "open_feature", feature }); window.setTimeout(() => postPlatformAction({ type: generate ? "demo_generate" : "set_prompt", ...action, feature }), 650); if (generate) showToast("已提交当前实机演示，请等待平台返回图片"); }
async function requestLiveNarration(phase, platformState = {}) {
  const director = state.liveDirector;
  const key = `${director.runId}:${phase}:${platformState.job?.id || "none"}:${platformState.job?.completed || 0}:${platformState.latestImage?.id || "none"}`;
  if (!director.running || director.narrationPending.has(key)) return;
  director.narrationPending.add(key);
  try {
    const response = await fetch("/api/director/live-state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase, prompt: platformState.prompt || liveDemoActions[slides[state.slideIndex].key]?.prompt || "", completed: platformState.job?.completed || 0, expected: platformState.job?.expected || 1, latestImage: Boolean(platformState.latestImage) }) });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.text && director.running) { director.lastNarrationAt = Date.now(); enqueueSpeech(result.text); }
  } catch (error) { reportClientLog("client.director.live-state", error, { phase }); }
  finally { director.narrationPending.delete(key); }
}
function startLiveDirector() {
  const director = state.liveDirector;
  director.running = true; director.phase = "preparing"; director.runId += 1; director.lastJobId = ""; director.lastImageId = ""; director.editCount = 0; director.generationSeen = false; director.lastPlatformState = null; director.lastNarrationAt = Date.now();
  $("#runDemo").textContent = "停止 AI 实机导演";
  sendCurrentDemoAction(true);
  enqueueSpeech("现在开始一轮真实操作演示。灵图AI会自动填写提示词并提交生成，等待期间我会重点说明它解决的场景问题和使用成本。平台目前免费试用，二K两分钱，四K九分钱，关注后即可领取入口。", { priority: true });
  clearInterval(director.heartbeat);
  director.heartbeat = setInterval(() => {
    if (!director.running) return;
    postPlatformAction({ type: "inspect_state", feature: "create" });
    if (director.lastPlatformState?.busy && state.speechQueue.length < 2 && Date.now() - director.lastNarrationAt > 12000) requestLiveNarration(director.phase === "editing" ? "editing" : "waiting", director.lastPlatformState);
  }, 2500);
}
function stopLiveDirector(message = "AI实机导演已停止") {
  const director = state.liveDirector;
  director.running = false; director.phase = "idle"; director.narrationPending.clear(); clearInterval(director.heartbeat); director.heartbeat = null;
  $("#runDemo").textContent = "启动 AI 实机导演"; showToast(message);
}
function handlePlatformState(platformState) {
  const director = state.liveDirector;
  if (!director.running) return;
  director.lastPlatformState = platformState;
  if (!platformState.loggedIn) { stopLiveDirector("请先登录灵图AI，再启动实机导演"); enqueueSpeech("当前真实页面还没有登录。请先完成登录，登录后我就可以继续自动演示生图和改图。", { priority: true }); return; }
  const job = platformState.job;
  if (job?.status === "running") {
    const newJob = job.id && job.id !== director.lastJobId;
    const newImage = platformState.latestImage?.id && platformState.latestImage.id !== director.lastImageId;
    director.lastJobId = job.id || director.lastJobId;
    if (job.type === "generation") director.generationSeen = true;
    if (newImage) { director.lastImageId = platformState.latestImage.id; requestLiveNarration("result", platformState); }
    else if (newJob || director.phase !== (job.type === "edit" ? "editing" : "waiting")) { director.phase = job.type === "edit" ? "editing" : "waiting"; requestLiveNarration(director.phase, platformState); }
    return;
  }
  if (job?.status === "failed" || job?.status === "cancelled") { requestLiveNarration("failed", platformState); stopLiveDirector("本轮真实任务未完成，导演已停止"); return; }
  if (platformState.latestImage?.id && platformState.latestImage.id !== director.lastImageId) { director.lastImageId = platformState.latestImage.id; requestLiveNarration("result", platformState); }
  if (director.generationSeen && platformState.latestImage?.id && director.editCount < 1 && !platformState.busy) {
    director.editCount += 1; director.phase = "editing";
    window.setTimeout(() => postPlatformAction({ type: "edit_latest_image", feature: "portraitEdit", prompt: "在保持主体、构图和整体质感一致的前提下，增强电影感光影与高级配色，让画面更适合作为商业宣传视觉", imageCount: 1 }), 1400);
    requestLiveNarration("editing", platformState); return;
  }
  if (director.editCount >= 1 && platformState.latestImage?.kind === "edit" && !platformState.busy) {
    requestLiveNarration("result", platformState);
    window.setTimeout(() => { postPlatformAction({ type: "open_feature", feature: "gallery" }); stopLiveDirector("本轮生图与续改演示已完成"); }, 3500);
  }
}
function setRealDemoFallback(message) { $("#realDemoLoading")?.classList.add("hidden"); $("#platformDemoFrame")?.classList.remove("hidden"); $("#screenshotFallback")?.classList.add("hidden"); if (message) { $("#realDemoLoadingText").textContent = message; showToast(message); } }
function initRealDemoFrame() { const frame = $("#platformDemoFrame"); if (!frame) return; if (frame.dataset.initialized === "true") return; const target = String(state.config.platformDemoUrl || state.config.platformUrl || "https://img.ziling.site").trim(); if (!target || !/^https?:\/\//i.test(target)) return setRealDemoFallback("未配置平台地址"); $("#realDemoLoading")?.classList.remove("hidden"); $("#screenshotFallback")?.classList.add("hidden"); const demoUrl = new URL("/", target); demoUrl.searchParams.set("live_demo", "1"); frame.dataset.initialized = "true"; frame.addEventListener("load", () => { clearTimeout(state.realDemoTimer); $("#realDemoLoading")?.classList.add("hidden"); frame.classList.remove("hidden"); $("#screenshotFallback")?.classList.add("hidden"); }, { once: true }); frame.src = demoUrl.toString(); state.realDemoTimer = setTimeout(() => { if (!state.realDemoReady) { $("#realDemoLoading")?.classList.add("hidden"); frame.classList.remove("hidden"); showToast("真实平台已打开；AI自动操作需先部署主站直播桥接"); } }, 20000); }
function handleDemoAction(payload) { const index = slides.findIndex(slide => slide.key === payload?.sceneKey); if (index < 0) return; updateSlide(index); prefetchScenes(index, state.cycle, 3); const label = slides[index].chapter.replace(/^\d+\s*·\s*/, ""); showToast(`正在切换到${label}案例`); if (state.voiceEnabled) enqueueSpeech(`现在切到${label}案例。这个场景会重点展示灵图AI怎样降低制作门槛和修改成本，平台目前免费试用，关注后即可领取入口。`, { priority: true }); }
function applyPublicConfig(config) { const mode = String(config.platformDemoMode || "slides").toLowerCase() === "real" ? "real" : "slides"; state.config = { ...config, platformDemoMode: mode, platformDemoUrl: config.platformDemoUrl || config.platformUrl || "https://img.ziling.site" }; state.sceneSpeechCache.clear(); state.sceneRequests.clear(); $("#brandTitle").textContent = sanitizeLiveText(config.title || "灵图AI"); $("#brandSubtitle").textContent = `${sanitizeLiveText(config.subtitle || "AI 图片创作工作台")} · ${mode === "real" ? "真实网页演示" : "幻灯片演示"}`; $("#loginPlatform").href = state.config.platformDemoUrl; $("#joinGroup").href = config.groupUrl || "#"; $("#joinGroup").textContent = sanitizeLiveText(config.groupLabel || "关注后进群试用"); if (mode === "real") { $("#screenshotFallback")?.classList.add("hidden"); $("#realDemoStage")?.classList.remove("hidden"); $("#bridgeStatus")?.classList.remove("connected"); if ($("#bridgeStatus span")) $("#bridgeStatus span").textContent = "正在加载真实网页"; initRealDemoFrame(); } else { $("#screenshotFallback")?.classList.remove("hidden"); $("#realDemoStage")?.classList.add("hidden"); $("#bridgeStatus")?.classList.add("connected"); if ($("#bridgeStatus span")) $("#bridgeStatus span").textContent = "本地幻灯片模式"; } if (state.voiceEnabled) setVoiceState(true); }
async function init() { loadVoices(); if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = loadVoices; updateClock(); setInterval(updateClock, 30000); applyPublicConfig(await fetch("/api/config", { cache: "no-store" }).then(response => response.json())); $("#voiceGateDesc").textContent = `${state.config.tts?.voice || "浏览器中文语音"}已就绪。AI会边播放当前讲稿，边预生成后续场景，并实时回答弹幕。`; const history = await fetch("/api/events/history", { cache: "no-store" }).then(response => response.json()); history.slice(-6).forEach(item => addEvent(item, false)); await Promise.allSettled($$("#screenshotFallback img").map(image => image.decode?.())); updateSlide(0); const stream = new EventSource("/api/events"); stream.addEventListener("live-event", event => { try { addEvent(JSON.parse(event.data)); } catch {} }); stream.addEventListener("director", event => { try { handleDirector(JSON.parse(event.data)); } catch {} }); stream.addEventListener("demo-action", event => { try { handleDemoAction(JSON.parse(event.data)); } catch {} }); stream.addEventListener("config-updated", event => { try { applyPublicConfig(JSON.parse(event.data)); showToast("直播配置已更新"); } catch {} }); stream.onerror = () => showToast("互动连接正在自动恢复"); }
function reportLivePresence(visible = document.visibilityState === "visible") { const payload = JSON.stringify({ visible }); if (!visible && navigator.sendBeacon) { navigator.sendBeacon("/api/live-presence", new Blob([payload], { type: "application/json" })); return; } fetch("/api/live-presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {}); }
reportLivePresence(); setInterval(() => { if (document.visibilityState === "visible") reportLivePresence(true); }, 5000); document.addEventListener("visibilitychange", () => reportLivePresence(document.visibilityState === "visible")); window.addEventListener("pagehide", () => reportLivePresence(false));
window.addEventListener("message", event => { let expectedOrigin = ""; try { expectedOrigin = new URL(state.config.platformDemoUrl || state.config.platformUrl).origin; } catch {} if (!expectedOrigin || event.origin !== expectedOrigin || event.source !== $("#platformDemoFrame")?.contentWindow || event.data?.source !== "lingtu-live-demo") return; const status = $("#bridgeStatus"); if (event.data?.type === "ready") { state.realDemoReady = true; clearTimeout(state.realDemoTimer); $("#realDemoLoading")?.classList.add("hidden"); $("#platformDemoFrame")?.classList.remove("hidden"); $("#screenshotFallback")?.classList.add("hidden"); status?.classList.add("connected"); if (status) status.querySelector("span").textContent = "平台桥接已连接，可自动操作"; window.setTimeout(() => sendCurrentDemoAction(false), 350); return; } if (event.data?.type === "action_received" || event.data?.type === "action_resumed") { status?.classList.add("working"); if (status) status.querySelector("span").textContent = event.data.navigating ? "正在切换真实功能页面" : "平台已收到操作指令"; return; } if (event.data?.type === "action_applied") { status?.classList.remove("working"); status?.classList.add("connected"); if (status) status.querySelector("span").textContent = "演示参数已填入真实页面"; showToast("平台已完成自动填写"); return; } if (event.data?.type === "generation_submitting") { status?.classList.add("working"); if (status) status.querySelector("span").textContent = "正在真实提交生图任务"; showToast("真实生图任务正在提交"); } });
function requestSceneByKey(sceneKey) { const index = slides.findIndex(slide => slide.key === sceneKey); if (index < 0) return; updateSlide(index); prefetchScenes(index, state.cycle, 3); if (state.voiceEnabled) enqueueSpeech(`好，我们现在看${slides[index].tab}。这个案例会直接说明它解决的问题和适合的使用场景，关注后可以领取免费试用入口。`, { priority: true }); }
function setControlDrawer(open) { const drawer = $("#controlDrawer"); const toggle = $("#controlToggle"); drawer?.classList.toggle("open", open); $("#drawerBackdrop")?.classList.toggle("show", open); drawer?.setAttribute("aria-hidden", String(!open)); toggle?.setAttribute("aria-expanded", String(open)); }
window.addEventListener("message", event => {
  let expectedOrigin = "";
  try { expectedOrigin = new URL(state.config.platformDemoUrl || state.config.platformUrl).origin; } catch {}
  if (!expectedOrigin || event.origin !== expectedOrigin || event.source !== $("#platformDemoFrame")?.contentWindow || event.data?.source !== "lingtu-live-demo" || event.data?.type !== "platform_state") return;
  handlePlatformState(event.data);
  const status = $("#bridgeStatus");
  if (status && event.data.job?.status === "running") status.querySelector("span").textContent = `真实任务进行中 ${event.data.job.completed || 0}/${event.data.job.expected || 1}`;
});
$("#runDemo").addEventListener("click", event => {
  event.stopImmediatePropagation();
  const nextIndex = (state.slideIndex + 1) % slides.length;
  const nextCycle = state.cycle + (nextIndex === 0 ? 1 : 0);
  if (state.voiceEnabled) void playScene(nextIndex, nextCycle); else updateSlide(nextIndex);
  setControlDrawer(false);
}, true);
$("#reloadPlatform").addEventListener("click", event => {
  event.stopImmediatePropagation();
  stopSpeech();
  state.cycle = 1;
  updateSlide(0);
  if (state.voiceEnabled) void playScene(0, 1);
  showToast("已从第一页重新播放");
  setControlDrawer(false);
}, true);
$("#enableVoice").addEventListener("click", enableVoice); $("#skipVoice").addEventListener("click", () => { $("#voiceGate")?.remove(); setVoiceState(false); }); $("#toggleVoice").addEventListener("click", toggleVoice); $("#runDemo").addEventListener("click", () => { sendCurrentDemoAction(true); setControlDrawer(false); }); $("#reloadPlatform").addEventListener("click", () => { state.realDemoReady = false; const frame = $("#platformDemoFrame"); if (frame) frame.src = frame.src; showToast("正在刷新灵图AI登录状态"); }); $("#controlToggle").addEventListener("click", () => setControlDrawer(!$("#controlDrawer")?.classList.contains("open"))); $("#controlClose").addEventListener("click", () => setControlDrawer(false)); $("#drawerBackdrop").addEventListener("click", () => setControlDrawer(false)); $$("#stageTabs button").forEach(button => button.addEventListener("click", () => { requestSceneByKey(slides[Number(button.dataset.index)]?.key); setControlDrawer(false); })); $$(`[data-scene-key]`).forEach(button => button.addEventListener("click", () => requestSceneByKey(button.dataset.sceneKey))); init().catch(error => { console.error(error); showToast("直播页配置读取失败，请刷新重试"); });
