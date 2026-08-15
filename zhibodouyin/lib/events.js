const METHOD_TYPES = {
  WebcastChatMessage: "chat",
  WebcastMemberMessage: "member",
  WebcastGiftMessage: "gift",
  WebcastLikeMessage: "like",
  WebcastSocialMessage: "social",
  WebcastFansclubMessage: "fansclub",
  WebcastEmojiChatMessage: "emoji",
  WebcastRoomUserSeqMessage: "stats",
  WebcastRoomStatsMessage: "stats"
};

function first(input, paths, fallback = "") {
  for (const path of paths) {
    let value = input;
    for (const key of path.split(".")) value = value?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function numberValue(input, paths, fallback = 0) {
  const value = Number(first(input, paths, fallback));
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeDouyinEvent(input) {
  const wrapper = input || {};
  const nested = wrapper.data && !Array.isArray(wrapper.data) ? wrapper.data : wrapper.payload && typeof wrapper.payload === "object" ? wrapper.payload : wrapper.message && typeof wrapper.message === "object" ? wrapper.message : {};
  const source = { ...wrapper, ...nested };
  const method = String(first(source, ["method", "type", "event", "msg_type", "event_type"], "chat"));
  const type = METHOD_TYPES[method] || method.replace(/^Webcast|Message$/g, "").toLowerCase() || "chat";
  const directUser = first(source, ["nickname", "name", "user_name", "user.nick_name", "user.nickname", "user.display_id"], "直播间朋友");
  const user = String(typeof source.user === "string" ? source.user : directUser).slice(0, 40);
  const text = String(first(source, ["text", "content", "comment", "message", "default_content"], "")).trim().slice(0, 240);
  const giftName = String(first(source, ["gift_name", "gift.name", "gift.describe"], "礼物")).slice(0, 60);
  const count = numberValue(source, ["count", "gift_cnt", "combo_count", "repeat_count"], 1);
  const current = numberValue(source, ["current", "online", "total"], 0);
  const total = numberValue(source, ["total_pv", "total_pv_for_anchor", "viewer_total"], 0);
  const displayText = text || ({
    member: `${user} 进入了直播间`,
    gift: `${user} 送出 ${giftName} ×${count}`,
    like: `${user} 点了 ${count} 个赞`,
    social: `${user} 关注了直播间`,
    fansclub: `${user} 加入了粉丝团`,
    stats: `当前观看 ${current}${total ? `，累计 ${total}` : ""}`
  }[type] || "");
  if (!displayText) return null;
  return {
    type, method, user, text: displayText, rawText: text, giftName, count, current, total,
    avatar: String(first(source, ["avatar", "user.avatar", "user.avatar_thumb.url_list.0"], "")).slice(0, 500),
    at: Number(first(source, ["at", "event_time", "timestamp", "create_time"], Date.now())) || Date.now()
  };
}

export function shouldAskAi(event) {
  if (!event || event.type !== "chat") return false;
  const text = event.rawText || event.text;
  return /怎么|如何|能不能|可以吗|是什么|多少|价格|收费|教程|使用|功能|模型|生成|修改|提示词|清晰|比例|尺寸|保存|下载|登录|注册|充值|余额|[?？]/i.test(text);
}
