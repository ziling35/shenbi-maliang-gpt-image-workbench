import type { Hono } from "hono";
import { requireConfig } from "./auth";
import { appDb, getAll } from "./db";
import { migrateObjectStorageFiles, objectStorageSettings, saveObjectStorageSettings, testObjectStorageConnection } from "./objectStorage";
import { readStoredFile } from "./secureFiles";

export function registerObjectStorageRoutes(api: Hono) {
  api.get("/config/object-storage", (c) => {
    const blocked = requireConfig(c);
    if (blocked) return blocked;
    return c.json({ settings: objectStorageSettings(false) });
  });

  api.put("/config/object-storage", async (c) => {
    const blocked = requireConfig(c);
    if (blocked) return blocked;
    const body = await c.req.json().catch(() => ({}));
    try {
      return c.json({ settings: saveObjectStorageSettings(body) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "对象存储配置保存失败" }, 400);
    }
  });

  api.post("/config/object-storage/test", async (c) => {
    const blocked = requireConfig(c);
    if (blocked) return blocked;
    try {
      return c.json(await testObjectStorageConnection());
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "腾讯云 COS 连接失败" }, 400);
    }
  });

  api.post("/config/object-storage/migrate", async (c) => {
    const blocked = requireConfig(c);
    if (blocked) return blocked;
    const paths = [
      ...getAll<{ path: string }>(appDb, "select path from images where path is not null"),
      ...getAll<{ path: string }>(appDb, "select path from assets where path is not null"),
      ...getAll<{ path: string }>(appDb, "select path from image_asset_references where path is not null"),
      ...getAll<{ path: string }>(appDb, "select path from message_source_references where path is not null"),
      ...getAll<{ path: string }>(appDb, "select path from image_derivatives where path is not null")
    ].map((item) => item.path);
    try {
      return c.json(await migrateObjectStorageFiles(paths, readStoredFile));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "历史图片迁移失败" }, 400);
    }
  });
}
