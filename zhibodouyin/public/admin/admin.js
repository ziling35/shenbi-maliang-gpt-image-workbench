const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const tokenKey = "lingtu-admin-token";
const state = { token: sessionStorage.getItem(tokenKey) || "", values: {}, configuredSecrets: {}, previewAudio: null, generatedWebhookToken: "" };
const voiceOptions = {
  stepfun: [
    ["cixingnansheng", "磁性男声"], ["wenrounansheng", "温柔男声"], ["wenrounvsheng", "温柔女声"],
    ["wenroushunv", "温柔熟女"], ["wenrougongzi", "温柔公子"], ["qinhenvsheng", "亲和女声"],
    ["qinqienvsheng", "亲切女声"], ["tianmeinvsheng", "甜美女声"], ["youyanvsheng", "优雅女声"],
    ["zhixingjiejie", "知性姐姐"], ["linjiajiejie", "邻家姐姐"], ["linjiameimei", "邻家妹妹"],
    ["yuanqishaonv", "元气少女"], ["yuanqinansheng", "元气男声"], ["qingchunshaonv", "清纯少女"],
    ["huolinvsheng", "活力女声"], ["jilingshaonv", "机灵少女"], ["ruanmengnvsheng", "软萌女声"],
    ["lengyanyujie", "冷艳御姐"], ["ganliannvsheng", "干练女声"], ["jingdiannvsheng", "经典女声"],
    ["wenjingxuejie", "文静学姐"], ["ruyananshi", "儒雅男士"], ["boyinnansheng", "播音男声"],
    ["shenchennanyin", "深沉男音"], ["shuangkuainansheng", "爽快男声"], ["zixinnansheng", "自信男声"],
    ["zhengpaiqingnian", "正派青年"], ["qingniandaxuesheng", "青年大学生"]
  ],
  grok2api: [["eve", "Eve"], ["alloy", "Alloy"], ["aria", "Aria"], ["verse", "Verse"]],
  volcengine: [["zh_female_cancan_mars_bigtts", "灿灿女声"], ["zh_female_shuangkuaisisi_moon_bigtts", "爽快思思"], ["zh_male_shaonianzixin_moon_bigtts", "少年梓辛"], ["zh_male_yangguangqingnian_moon_bigtts", "阳光青年"]],
  tencent: [["101001", "智逍遥（男声）"], ["101002", "智瑜（女声）"], ["101003", "智聆（女声）"], ["101004", "智美（女声）"], ["101005", "智云（男声）"]],
  aliyun: [["xiaoyun", "小云（女声）"], ["xiaogang", "小刚（男声）"], ["ruoxi", "若兮（女声）"], ["siqi", "思琪（女声）"], ["sijia", "思佳（女声）"], ["sicheng", "思诚（男声）"]]
};

function showToast(text) { const node = $("#toast"); node.textContent = text; node.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => node.classList.remove("show"), 2600); }
function headers(json = false) { return { ...(json ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${state.token}` }; }
function setError(text) { $("#loginError").textContent = text || ""; }
async function request(url, options = {}) { const response = await fetch(url, { ...options, headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) } }); if (response.status === 401) { state.token = ""; sessionStorage.removeItem(tokenKey); showLogin(); throw new Error("管理员令牌已失效"); } const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "请求失败"); return data; }
function showLogin() { $("#loginView").classList.remove("hidden"); $("#appView").classList.add("hidden"); $("#tokenInput").focus(); }
function showApp() { $("#loginView").classList.add("hidden"); $("#appView").classList.remove("hidden"); }
function fillVoiceSelect(provider, currentValue) { const select = $(`[data-voice-select="${provider}"]`); if (!select) return; const options = voiceOptions[provider] || []; const known = options.some(([value]) => value === String(currentValue || "")); select.innerHTML = `${options.map(([value, label]) => `<option value="${value}">${label} · ${value}</option>`).join("")}<option value="__custom__">自定义音色 ID…</option>`; if (known || !currentValue) select.value = currentValue || options[0]?.[0] || "__custom__"; else { select.value = "__custom__"; $(`[data-custom-voice-input="${provider}"]`).value = currentValue; } toggleCustomVoice(provider); }
function toggleCustomVoice(provider) { const select = $(`[data-voice-select="${provider}"]`); const row = $(`[data-custom-voice="${provider}"]`); if (!select || !row) return; row.classList.toggle("hidden", select.value !== "__custom__"); }
function renderValues() { $$('[data-key]').forEach(input => { const key = input.dataset.key; if (input.dataset.voiceSelect) return; if (input.dataset.secret) { input.value = ""; input.placeholder = state.configuredSecrets[key] ? "已配置，留空保持不变" : "尚未配置"; } else { const value = state.values[key] ?? ""; input.value = input.dataset.durationSeconds === "true" && value !== "" ? String(Number(value) >= 1000 ? Number(value) / 1000 : Number(value)) : value; } }); Object.keys(voiceOptions).forEach(provider => { const select = $(`[data-voice-select="${provider}"]`); fillVoiceSelect(provider, select ? state.values[select.dataset.key] : ""); }); }
async function loadProviderVoices(provider, button) { const result = $(`[data-voice-load-result="${provider}"]`); if (button) button.disabled = true; if (result) result.textContent = "正在读取可用音色…"; try { const modelInput = $('[data-key="GROK_TTS_MODEL"]'); const model = provider === "grok2api" ? String(modelInput?.value || state.values.GROK_TTS_MODEL || "").trim() : ""; const data = await request(`/api/admin/tts-voices?provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}`); voiceOptions[provider] = (data.voices || []).map(voice => [voice.id, voice.name || voice.id]); const select = $(`[data-voice-select="${provider}"]`); const currentValue = select?.value === "__custom__" ? $(`[data-custom-voice-input="${provider}"]`)?.value : select?.value; fillVoiceSelect(provider, currentValue || state.values[select?.dataset.key] || ""); if (result) result.textContent = `已读取 ${voiceOptions[provider].length} 个音色`; } catch (error) { if (result) result.textContent = `音色读取失败：${error.message}`; } finally { if (button) button.disabled = false; } }
function collectValues() { const values = {}; const clearSecrets = []; $$('[data-key]').forEach(input => { const key = input.dataset.key; let value = input.value; if (input.dataset.voiceSelect && value === "__custom__") value = $(`[data-custom-voice-input="${input.dataset.voiceSelect}"]`).value.trim(); if (input.dataset.secret) { if (value.trim()) values[key] = value.trim(); if (input.dataset.clear === "true") clearSecrets.push(key); } else { if (input.dataset.durationSeconds === "true" && value !== "") value = String(Math.round(Number(value) * 1000)); values[key] = value; } }); return { values, clearSecrets }; }
function renderStatus(data) { const publicConfig = data.status?.public || {}; const tts = publicConfig.tts || {}; $("#statusText").textContent = `${publicConfig.title || "灵图AI"} · 已连接`; $("#ttsStatus").textContent = `当前：${tts.voice || "浏览器中文语音"}（${tts.active || "browser"}）`; $("#ttsStatus").classList.toggle("fallback", (state.values.TTS_PROVIDER || "browser") !== (tts.active || "browser")); $("#webhookEndpoint").textContent = `${location.origin}/api/douyin/events`; }
function renderBridgeStatus(bridge = {}) { const labels = { disabled: "未启用", connecting: "连接中", connected: "已连接", waiting: "等待重连", error: "连接错误" }; const details = [labels[bridge.state] || bridge.state || "未知", bridge.message, bridge.received ? `已接收 ${bridge.received} 条` : ""].filter(Boolean); $("#douyinBridgeStatus").textContent = details.join(" · "); }
async function refreshDouyinStatus() { try { const data = await request("/api/admin/douyin/status"); renderBridgeStatus(data.bridge); } catch (error) { $("#douyinBridgeStatus").textContent = `状态读取失败：${error.message}`; } }
async function generateWebhookToken() { const button = $("#generateWebhookToken"); button.disabled = true; try { const data = await request("/api/admin/douyin/token", { method: "POST" }); state.generatedWebhookToken = data.token; state.configuredSecrets = data.configuredSecrets || state.configuredSecrets; $("#generatedWebhookToken").textContent = data.token; $("#copyWebhookToken").disabled = false; showToast("Webhook Token 已重新生成，请立即复制保存"); } catch (error) { showToast(error.message); } finally { button.disabled = false; } }
async function copyWebhookToken() { if (!state.generatedWebhookToken) return; await navigator.clipboard.writeText(state.generatedWebhookToken); showToast("Token 已复制"); }
async function testDouyinEvent() { const button = $("#testDouyinEvent"); button.disabled = true; try { await request("/api/admin/douyin/test-event", { method: "POST" }); showToast("测试弹幕已发送，请查看直播页"); } catch (error) { showToast(error.message); } finally { button.disabled = false; } }
function escapeLog(value) { return String(value ?? "").replace(/[&<>"']/g, function(char) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char]; }); }
async function loadLogs() {
  const filter = $("#logFilter")?.value || "all";
  const query = filter === "all" ? "" : "&ok=" + String(filter === "success");
  try {
    const data = await request("/api/admin/logs?limit=300" + query);
    const stats = data.stats || {};
    $("#logStats").textContent = "共 " + (stats.total || 0) + " 条 · 成功 " + (stats.success || 0) + " · 失败 " + (stats.failed || 0);
    const rows = (data.logs || []).map(function(log) {
      const status = log.ok ? "成功" : "失败";
      const provider = [log.provider, log.model].filter(Boolean).join(" / ") || "—";
      const info = [log.message, log.error].filter(Boolean).join("：") || "—";
      const duration = log.durationMs == null ? "—" : String(log.durationMs) + " ms";
      return "<tr class=\"log-" + (log.ok ? "success" : "failed") + "\"><td>" + escapeLog(new Date(log.at).toLocaleString()) + "</td><td><span class=\"log-status\">" + status + "</span></td><td><code>" + escapeLog(log.type) + "</code></td><td>" + escapeLog(provider) + "</td><td>" + duration + "</td><td title=\"" + escapeLog(info) + "\">" + escapeLog(info) + "</td></tr>";
    }).join("");
    $("#requestLogBody").innerHTML = rows || "<tr><td colspan=\"6\">暂无记录</td></tr>";
  } catch (error) { $("#logStats").textContent = "日志读取失败：" + error.message; }
}
async function clearLogs() { if (!confirm("确定清空所有请求日志吗？")) return; try { await request("/api/admin/logs", { method: "DELETE" }); await loadLogs(); showToast("请求日志已清空"); } catch (error) { showToast(error.message); } }
async function loadConfig() { const data = await request("/api/admin/config"); state.values = data.values || {}; state.configuredSecrets = data.configuredSecrets || {}; renderValues(); renderStatus(data); $("#saveResult").textContent = "配置已加载"; if (state.configuredSecrets.GROK_TTS_API_KEY) void loadProviderVoices("grok2api"); }
async function login() { const token = $("#tokenInput").value.trim(); if (!token) return setError("请输入管理员令牌"); state.token = token; try { await request("/api/admin/session", { method: "POST" }); sessionStorage.setItem(tokenKey, token); setError(""); showApp(); await loadConfig(); } catch (error) { state.token = ""; setError(error.message); } }
async function save(showMessage = true) { const button = $("#saveButton"); button.disabled = true; try { const data = await request("/api/admin/config", { method: "PUT", body: JSON.stringify(collectValues()) }); state.values = data.values; state.configuredSecrets = data.configuredSecrets; renderValues(); renderStatus(data); $("#saveResult").textContent = `已保存 · ${new Date().toLocaleTimeString()}`; if (showMessage) showToast("配置已保存并立即生效"); return data; } catch (error) { showToast(error.message); throw error; } finally { button.disabled = false; } }
async function previewProvider(provider, button) { const result = $(`[data-preview-result="${provider}"]`); button.disabled = true; result.className = "preview-result"; result.textContent = "正在保存配置并生成试听音频…"; try { await save(false); const response = await fetch("/api/admin/tts-preview", { method: "POST", headers: headers(true), body: JSON.stringify({ provider, text: "欢迎来到灵图AI直播间，现在播放的是语音配置试听。" }) }); if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "试听失败"); } if (state.previewAudio) { state.previewAudio.pause(); URL.revokeObjectURL(state.previewAudio.src); } const blob = await response.blob(); const audio = new Audio(URL.createObjectURL(blob)); state.previewAudio = audio; await audio.play(); result.className = "preview-result success"; result.textContent = `试听成功 · ${provider} · ${(blob.size / 1024).toFixed(1)} KB`; await loadConfig(); } catch (error) { result.className = "preview-result error"; result.textContent = `试听失败：${error.message}`; } finally { button.disabled = false; } }
async function test(service) { const target = $(`[data-test="${service}"]`); const result = $(`#${service}TestResult`); target.disabled = true; result.textContent = "测试中…"; try { const data = await request("/api/admin/test", { method: "POST", body: JSON.stringify({ service, text: "请用一句简短自然的话介绍灵图AI。" }) }); result.textContent = `成功：${data.text}`; } catch (error) { result.textContent = `失败：${error.message}`; } finally { target.disabled = false; } }

$$('.side-nav button').forEach(button => button.addEventListener("click", () => { $$('.side-nav button').forEach(item => item.classList.toggle("active", item === button)); $$('.settings-section').forEach(section => section.classList.toggle("active", section.dataset.section === button.dataset.section)); }));
$$('[data-voice-select]').forEach(select => select.addEventListener("change", () => toggleCustomVoice(select.dataset.voiceSelect)));
$$('[data-preview-provider]').forEach(button => button.addEventListener("click", () => previewProvider(button.dataset.previewProvider, button)));
$$('[data-load-voices]').forEach(button => button.addEventListener("click", async () => { try { await save(false); await loadProviderVoices(button.dataset.loadVoices, button); } catch {} }));
$("#refreshLogs").addEventListener("click", function() { loadLogs(); }); $("#clearLogs").addEventListener("click", clearLogs); $("#logFilter").addEventListener("change", function() { loadLogs(); });
$("#generateWebhookToken").addEventListener("click", generateWebhookToken); $("#copyWebhookToken").addEventListener("click", copyWebhookToken); $("#refreshDouyinStatus").addEventListener("click", refreshDouyinStatus); $("#testDouyinEvent").addEventListener("click", testDouyinEvent);
$("#loginButton").addEventListener("click", login); $("#tokenInput").addEventListener("keydown", event => { if (event.key === "Enter") login(); }); $("#saveButton").addEventListener("click", () => save()); $("#reloadButton").addEventListener("click", () => loadConfig().catch(error => showToast(error.message))); $("#logoutButton").addEventListener("click", () => { state.token = ""; sessionStorage.removeItem(tokenKey); showLogin(); }); $$('.secondary-button[data-test]').forEach(button => button.addEventListener("click", () => test(button.dataset.test)));
if (state.token) request("/api/admin/session", { method: "POST" }).then(async () => { showApp(); await loadConfig(); await refreshDouyinStatus(); }).catch(() => showLogin()); else showLogin();
setInterval(() => { if (state.token && !$("#appView").classList.contains("hidden")) void refreshDouyinStatus(); }, 5000);

