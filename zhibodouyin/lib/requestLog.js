import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function compact(value, max = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function safeDetails(input = {}) {
  const blocked = /key|token|secret|authorization|password|credential/i;
  return Object.fromEntries(Object.entries(input).filter(([key]) => !blocked.test(key)).map(([key, value]) => {
    if (value == null || typeof value === "number" || typeof value === "boolean") return [key, value];
    return [key, compact(value)];
  }));
}

export function createRequestLogger(root) {
  const dataDir = path.join(root, "data");
  const logFile = path.join(dataDir, "request-logs.jsonl");
  const rotatedFile = path.join(dataDir, "request-logs.1.jsonl");
  fs.mkdirSync(dataDir, { recursive: true });

  function rotateIfNeeded() {
    try {
      if (!fs.existsSync(logFile) || fs.statSync(logFile).size < 5 * 1024 * 1024) return;
      if (fs.existsSync(rotatedFile)) fs.rmSync(rotatedFile, { force: true });
      fs.renameSync(logFile, rotatedFile);
    } catch (error) {
      console.warn("请求日志轮转失败", error?.message || error);
    }
  }

  function write(entry) {
    rotateIfNeeded();
    const item = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      level: entry.level || (entry.ok === false ? "error" : "info"),
      ok: entry.ok !== false,
      type: compact(entry.type || "request", 50),
      provider: compact(entry.provider || "", 60),
      model: compact(entry.model || "", 100),
      durationMs: Number.isFinite(entry.durationMs) ? Math.max(0, Math.round(entry.durationMs)) : null,
      message: compact(entry.message || "", 300),
      error: compact(entry.error || "", 500),
      details: safeDetails(entry.details)
    };
    try { fs.appendFileSync(logFile, `${JSON.stringify(item)}\n`, "utf8"); }
    catch (error) { console.warn("请求日志写入失败", error?.message || error); }
    return item;
  }

  function read({ limit = 200, ok, type = "" } = {}) {
    const requested = Math.min(1000, Math.max(1, Number(limit) || 200));
    const files = [rotatedFile, logFile].filter(file => fs.existsSync(file));
    const items = [];
    for (const file of files) {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try { items.push(JSON.parse(line)); } catch {}
      }
    }
    const filtered = items.filter(item => (ok === undefined || item.ok === ok) && (!type || item.type === type));
    return filtered.slice(-requested).reverse();
  }

  function clear() {
    for (const file of [logFile, rotatedFile]) if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }

  function stats() {
    const items = read({ limit: 1000 });
    return {
      total: items.length,
      success: items.filter(item => item.ok).length,
      failed: items.filter(item => !item.ok).length,
      latestAt: items[0]?.at || null,
      file: path.relative(root, logFile).replaceAll("\\", "/")
    };
  }

  return { write, read, clear, stats, logFile };
}