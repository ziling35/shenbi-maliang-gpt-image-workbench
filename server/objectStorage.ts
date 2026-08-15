import COS from "cos-nodejs-sdk-v5";
import { existsSync } from "node:fs";
import { readdir, unlink } from "node:fs/promises";
import { configDb, getAll, getOne, run } from "./db";
import { absoluteDataPath } from "./paths";
import { now } from "./utils";

type ObjectStorageRow = {
  enabled: number;
  secret_id: string;
  secret_key: string;
  bucket: string;
  region: string;
  base_path: string;
  public_base_url: string;
  local_cache_days: number;
  updated_at: string;
};

export type ObjectStorageSettings = {
  enabled: boolean;
  provider: "local" | "cos";
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  basePath: string;
  publicBaseUrl: string;
  localCacheDays: number;
  updatedAt: string;
};

type ObjectStorageCacheRow = {
  path: string;
  uploaded_at: string;
  last_accessed_at: string;
};

const DEFAULT_LOCAL_CACHE_DAYS = 7;
const CACHE_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
let cacheCleanupTimer: ReturnType<typeof setInterval> | null = null;

let clientCache: { key: string; client: COS } | null = null;

function ensureTable() {
  configDb.run(`create table if not exists object_storage_settings (
    id text primary key,
    enabled integer not null default 0,
    secret_id text not null default '',
    secret_key text not null default '',
    bucket text not null default '',
    region text not null default '',
    base_path text not null default 'gpt-image-workbench',
    public_base_url text not null default '',
    local_cache_days integer not null default ${DEFAULT_LOCAL_CACHE_DAYS},
    updated_at text not null
  )`);
  const columns = configDb.query("pragma table_info(object_storage_settings)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "local_cache_days")) {
    configDb.run(`alter table object_storage_settings add column local_cache_days integer not null default ${DEFAULT_LOCAL_CACHE_DAYS}`);
  }
  configDb.run(`create table if not exists object_storage_cache_entries (
    path text primary key,
    uploaded_at text not null,
    last_accessed_at text not null
  )`);
}

function normalizeLocalCacheDays(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LOCAL_CACHE_DAYS;
  return Math.min(30, Math.max(1, Math.round(parsed)));
}

function row() {
  ensureTable();
  return getOne<ObjectStorageRow>(configDb, "select * from object_storage_settings where id = 'default'");
}

export function objectStorageSettings(includeSecret = false): ObjectStorageSettings {
  const value = row();
  return {
    enabled: Boolean(value?.enabled),
    provider: value?.enabled ? "cos" : "local",
    secretId: value?.secret_id ?? "",
    secretKey: includeSecret ? value?.secret_key ?? "" : value?.secret_key ? "********" : "",
    bucket: value?.bucket ?? "",
    region: value?.region ?? "",
    basePath: value?.base_path ?? "gpt-image-workbench",
    publicBaseUrl: value?.public_base_url ?? "",
    localCacheDays: normalizeLocalCacheDays(value?.local_cache_days),
    updatedAt: value?.updated_at ?? ""
  };
}

export function saveObjectStorageSettings(input: Partial<ObjectStorageSettings>) {
  const existing = objectStorageSettings(true);
  const secretKey = input.secretKey === "********" ? existing.secretKey : String(input.secretKey ?? "").trim();
  const enabled = Boolean(input.enabled);
  const bucket = String(input.bucket ?? "").trim();
  const region = String(input.region ?? "").trim();
  const localCacheDays = normalizeLocalCacheDays(input.localCacheDays);
  if (enabled && (!String(input.secretId ?? "").trim() || !secretKey || !bucket || !region)) {
    throw new Error("启用腾讯云 COS 前请完整填写 SecretId、SecretKey、Bucket 和地域");
  }
  const timestamp = new Date().toISOString();
  run(configDb, `insert into object_storage_settings(id,enabled,secret_id,secret_key,bucket,region,base_path,public_base_url,local_cache_days,updated_at)
    values('default',?,?,?,?,?,?,?,?,?) on conflict(id) do update set enabled=excluded.enabled,secret_id=excluded.secret_id,secret_key=excluded.secret_key,bucket=excluded.bucket,region=excluded.region,base_path=excluded.base_path,public_base_url=excluded.public_base_url,local_cache_days=excluded.local_cache_days,updated_at=excluded.updated_at`,
  enabled ? 1 : 0,
  String(input.secretId ?? "").trim(),
  secretKey,
  bucket,
  region,
  String(input.basePath ?? "gpt-image-workbench").trim().replace(/^\/+|\/+$/g, "") || "gpt-image-workbench",
  String(input.publicBaseUrl ?? "").trim().replace(/\/$/, ""),
  localCacheDays,
  timestamp);
  clientCache = null;
  return objectStorageSettings(false);
}

function cleanPath(value: string) {
  return value.replace(/^\/+/, "").replaceAll("\\", "/").split("/").filter((item) => item && item !== "." && item !== "..").join("/");
}

function usesCos(relativePath: string, settings = objectStorageSettings(true)) {
  const path = cleanPath(relativePath);
  return settings.enabled && [
    "files/secure/images/",
    "files/secure/derivatives/",
    "files/secure/image-references/",
    "files/secure/assets/",
    "files/secure/branding/",
    "files/secure/user-avatars/",
    "files/secure/videos/",
    "files/image-masks/"
  ].some((prefix) => path.startsWith(prefix));
}

function objectKey(relativePath: string, settings: ObjectStorageSettings) {
  return [settings.basePath, cleanPath(relativePath)].filter(Boolean).join("/");
}

function cosClient(settings: ObjectStorageSettings) {
  const key = `${settings.secretId}\0${settings.secretKey}`;
  if (!clientCache || clientCache.key !== key) {
    clientCache = { key, client: new COS({ SecretId: settings.secretId, SecretKey: settings.secretKey }) };
  }
  return clientCache.client;
}

function cosRequest<T>(request: (callback: (error: unknown, data: T) => void) => void) {
  return new Promise<T>((resolve, reject) => request((error, data) => error ? reject(error) : resolve(data)));
}

export function objectStorageUsesCos(relativePath: string) {
  return usesCos(relativePath);
}

function ensureCacheTable() {
  ensureTable();
}

export function objectStorageFileIsSynced(relativePath: string) {
  if (!objectStorageUsesCos(relativePath)) return false;
  ensureCacheTable();
  return Boolean(getOne<ObjectStorageCacheRow>(
    configDb,
    "select path from object_storage_cache_entries where path = ?",
    cleanPath(relativePath)
  ));
}

export function markObjectStorageCachePending(relativePath: string) {
  if (!objectStorageUsesCos(relativePath)) return;
  ensureCacheTable();
  run(configDb, "delete from object_storage_cache_entries where path = ?", cleanPath(relativePath));
}

export function markObjectStorageUploaded(relativePath: string) {
  if (!objectStorageUsesCos(relativePath)) return;
  ensureCacheTable();
  const timestamp = now();
  run(configDb, `insert into object_storage_cache_entries(path,uploaded_at,last_accessed_at)
    values(?,?,?) on conflict(path) do update set uploaded_at=excluded.uploaded_at,last_accessed_at=excluded.last_accessed_at`,
  cleanPath(relativePath), timestamp, timestamp);
}

export function touchObjectStorageCache(relativePath: string) {
  if (!objectStorageUsesCos(relativePath)) return;
  ensureCacheTable();
  run(configDb, "update object_storage_cache_entries set last_accessed_at = ? where path = ?", now(), cleanPath(relativePath));
}

export function forgetObjectStorageCache(relativePath: string) {
  ensureCacheTable();
  run(configDb, "delete from object_storage_cache_entries where path = ?", cleanPath(relativePath));
}

export async function cleanupObjectStorageLocalCache() {
  const settings = objectStorageSettings(true);
  if (!settings.enabled) return { removed: 0, checked: 0 };
  ensureCacheTable();
  const cutoff = Date.now() - settings.localCacheDays * 24 * 60 * 60 * 1000;
  const rows = getAll<ObjectStorageCacheRow>(
    configDb,
    "select path,uploaded_at,last_accessed_at from object_storage_cache_entries where last_accessed_at < ? limit 500",
    new Date(cutoff).toISOString()
  );
  let removed = 0;
  for (const row of rows) {
    const localPath = absoluteDataPath(row.path);
    if (existsSync(localPath)) {
      await unlink(localPath).catch(() => undefined);
      if (existsSync(localPath)) continue;
      removed += 1;
    }
    run(configDb, "delete from object_storage_cache_entries where path = ?", row.path);
  }
  return { removed, checked: rows.length };
}

export function startObjectStorageCacheScheduler() {
  if (cacheCleanupTimer) return;
  void cleanupObjectStorageLocalCache().catch((error) => console.warn("对象存储本地缓存清理失败", error));
  cacheCleanupTimer = setInterval(() => {
    void cleanupObjectStorageLocalCache().catch((error) => console.warn("对象存储本地缓存清理失败", error));
  }, CACHE_CLEANUP_INTERVAL_MS);
  cacheCleanupTimer.unref?.();
}

export async function getStoredObjectUrl(relativePath: string, expires = 300) {
  const settings = objectStorageSettings(true);
  if (!usesCos(relativePath, settings)) return null;
  if (settings.publicBaseUrl) return `${settings.publicBaseUrl}/${encodeURIComponent(objectKey(relativePath, settings)).replaceAll("%2F", "/")}`;
  return cosRequest<string>((callback) => cosClient(settings).getObjectUrl({ Bucket: settings.bucket, Region: settings.region, Key: objectKey(relativePath, settings), Sign: true, Expires: expires }, (_error, data) => callback(null, data.Url)));
}

export async function readObjectStorageFile(relativePath: string) {
  const settings = objectStorageSettings(true);
  const result = await cosRequest<{ Body?: Buffer | string }>((callback) => cosClient(settings).getObject({ Bucket: settings.bucket, Region: settings.region, Key: objectKey(relativePath, settings) }, callback));
  return Buffer.isBuffer(result.Body) ? result.Body : Buffer.from(String(result.Body ?? ""), "binary");
}

export async function writeObjectStorageFile(relativePath: string, buffer: Buffer, mimeType?: string) {
  const settings = objectStorageSettings(true);
  await cosRequest((callback) => cosClient(settings).putObject({ Bucket: settings.bucket, Region: settings.region, Key: objectKey(relativePath, settings), Body: buffer, ...(mimeType ? { ContentType: mimeType } : {}) }, callback));
}

export async function deleteObjectStorageFile(relativePath: string) {
  const settings = objectStorageSettings(true);
  await cosRequest((callback) => cosClient(settings).deleteObject({ Bucket: settings.bucket, Region: settings.region, Key: objectKey(relativePath, settings) }, callback));
}

export async function testObjectStorageConnection() {
  const settings = objectStorageSettings(true);
  if (!settings.enabled) throw new Error("请先启用腾讯云 COS");
  await cosRequest((callback) => cosClient(settings).headBucket({ Bucket: settings.bucket, Region: settings.region }, callback));
  return { ok: true };
}

export async function migrateObjectStorageFiles(paths: string[], readFile: (path: string) => Promise<Buffer>) {
  const settings = objectStorageSettings(true);
  if (!settings.enabled) throw new Error("请先启用腾讯云 COS");
  const uniquePaths = Array.from(new Set(paths.map(cleanPath).filter((path) => usesCos(path, settings))));
  let migrated = 0;
  for (const filePath of uniquePaths) {
    await writeObjectStorageFile(filePath, await readFile(filePath));
    markObjectStorageUploaded(filePath);
    migrated += 1;
  }
  return { migrated, total: uniquePaths.length };
}

export async function listLocalObjectStorageFiles() {
  const roots = [
    "files/secure/images",
    "files/secure/derivatives",
    "files/secure/image-references",
    "files/secure/assets",
    "files/secure/branding",
    "files/secure/user-avatars",
    "files/secure/videos",
    "files/image-masks"
  ];
  const files: string[] = [];
  async function walk(relativeDir: string) {
    const entries = await readdir(absoluteDataPath(relativeDir), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const relativePath = `${relativeDir}/${entry.name}`.replaceAll("\\", "/");
      if (entry.isDirectory()) await walk(relativePath);
      else if (entry.isFile() && objectStorageUsesCos(relativePath)) files.push(relativePath);
    }
  }
  for (const root of roots) await walk(root);
  return files;
}
