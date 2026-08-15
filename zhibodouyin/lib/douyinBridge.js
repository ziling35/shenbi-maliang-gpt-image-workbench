const reconnectDelay = 5000;

export function createDouyinBridge({ onEvent, onStatus }) {
  let socket = null;
  let retryTimer = null;
  let generation = 0;
  let status = { state: "disabled", message: "尚未启用", roomId: "", received: 0, lastEventAt: 0 };

  function publish(next) {
    status = { ...status, ...next };
    onStatus?.(status);
  }
  function stop() {
    generation += 1;
    clearTimeout(retryTimer);
    retryTimer = null;
    if (socket) { try { socket.close(); } catch {} }
    socket = null;
  }
  function connect() {
    stop();
    const enabled = String(process.env.DOUYIN_BRIDGE_ENABLED || "false").toLowerCase() === "true";
    const roomId = String(process.env.DOUYIN_ROOM_ID || "").trim();
    if (!enabled || !roomId) {
      publish({ state: "disabled", message: enabled ? "请填写直播间 ID" : "桥接未启用", roomId });
      return;
    }
    const currentGeneration = generation;
    const base = String(process.env.DOUYIN_LIVE_WS_BASE_URL || "ws://127.0.0.1:1088").replace(/\/$/, "");
    const url = `${base}/ws/${encodeURIComponent(roomId)}`;
    publish({ state: "connecting", message: `正在连接 ${url}`, roomId });
    try { socket = new WebSocket(url); } catch (error) { schedule(error.message, currentGeneration); return; }
    socket.addEventListener("open", () => publish({ state: "connected", message: "已连接 douyinLive，等待直播消息", roomId }));
    socket.addEventListener("message", event => {
      try {
        const payload = JSON.parse(String(event.data || "{}"));
        if (payload.type === "system") { publish({ message: payload.status_text || payload.message || "已连接 douyinLive" }); return; }
        const accepted = onEvent(payload);
        if (accepted) publish({ received: status.received + 1, lastEventAt: Date.now(), message: `已接收 ${payload.method || payload.type || "直播"} 消息` });
      } catch (error) { publish({ message: `忽略无法解析的消息：${error.message}` }); }
    });
    socket.addEventListener("error", () => publish({ state: "error", message: "无法连接 douyinLive，请先启动采集程序" }));
    socket.addEventListener("close", () => schedule("连接已断开，准备重连", currentGeneration));
  }
  function schedule(message, currentGeneration) {
    if (currentGeneration !== generation) return;
    socket = null;
    publish({ state: "waiting", message });
    retryTimer = setTimeout(connect, reconnectDelay);
  }
  return { connect, stop, snapshot: () => ({ ...status }) };
}
