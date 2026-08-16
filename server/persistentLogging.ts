import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { inspect } from "node:util";
import { DATA_DIR } from "./paths";

type LogLevel = "log" | "info" | "warn" | "error";

const LOG_DIR = path.join(DATA_DIR, "logs");
const LOG_RETENTION_DAYS = Math.max(1, Math.min(365, Number(Bun.env.LOG_RETENTION_DAYS ?? 14) || 14));
const MAX_LOG_LINE_LENGTH = 100_000;
let initialized = false;

function logDate(timestamp = new Date()) {
  return timestamp.toISOString().slice(0, 10);
}

function logPath(prefix: "server" | "error", timestamp = new Date()) {
  return path.join(LOG_DIR, `${prefix}-${logDate(timestamp)}.log`);
}

function redact(value: string) {
  return value
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,"'}]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|secret[_-]?(?:key|id)|password|token)\s*[:=]\s*)["']?[^\s,"'}]+/gi, "$1[REDACTED]")
    .replace(/(g2a_|sk-|sess-|eyJ)[A-Za-z0-9._-]{12,}/g, "$1[REDACTED]");
}

function formatArgument(value: unknown) {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  return inspect(value, {
    depth: 6,
    colors: false,
    compact: true,
    breakLength: 180,
    maxArrayLength: 80,
    maxStringLength: 20_000
  });
}

function append(level: LogLevel, args: unknown[]) {
  const timestamp = new Date();
  const detail = redact(args.map(formatArgument).join(" "));
  const line = `${timestamp.toISOString()} [${level.toUpperCase()}] ${detail}`.slice(0, MAX_LOG_LINE_LENGTH) + "\n";
  try {
    appendFileSync(logPath("server", timestamp), line, "utf8");
    if (level === "warn" || level === "error") appendFileSync(logPath("error", timestamp), line, "utf8");
  } catch {
  }
}

function cleanupOldLogs() {
  if (!existsSync(LOG_DIR)) return;
  const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const fileName of readdirSync(LOG_DIR)) {
    if (!/^(?:server|error)-\d{4}-\d{2}-\d{2}\.log$/.test(fileName)) continue;
    const filePath = path.join(LOG_DIR, fileName);
    try {
      if (statSync(filePath).mtimeMs < cutoff) unlinkSync(filePath);
    } catch {
    }
  }
}

export function initializePersistentLogging() {
  if (initialized) return { logDir: LOG_DIR, serverLog: logPath("server"), errorLog: logPath("error") };
  initialized = true;
  mkdirSync(LOG_DIR, { recursive: true });
  cleanupOldLogs();

  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };
  for (const level of ["log", "info", "warn", "error"] as const) {
    console[level] = (...args: unknown[]) => {
      append(level, args);
      originalConsole[level](...args);
    };
  }

  process.on("uncaughtExceptionMonitor", (error, origin) => {
    append("error", ["未捕获异常", origin, error]);
  });
  process.on("unhandledRejection", (reason) => {
    append("error", ["未处理 Promise 拒绝", reason]);
  });

  append("info", ["持久化日志已启动", { pid: process.pid, platform: process.platform, bun: Bun.version, logDir: LOG_DIR }]);
  return { logDir: LOG_DIR, serverLog: logPath("server"), errorLog: logPath("error") };
}
