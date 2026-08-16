# Docker 部署

本文适用于源码部署和二次开发版本。容器只运行一个应用实例，`data/` 必须保留在宿主机上；其中含有数据库、后台配置、渠道密钥、余额记录、订单、生成图片和上传文件。

## 前置条件

- Linux 服务器已安装 Docker Engine 和 Docker Compose 插件。
- 域名已解析到服务器公网 IP。
- 当前代码已包含 `Dockerfile`、`docker-compose.yml` 和 `.env.example`。

## 首次部署

```bash
git clone -b feature/commercial-billing https://github.com/ziling35/shenbi-maliang-gpt-image-workbench.git app
cd app

cp .env.example .env
docker compose up -d --build
docker compose ps
docker compose logs -f maliang
```

默认只绑定宿主机的 `127.0.0.1:8787`，应通过 Nginx 或 Caddy 暴露域名和 HTTPS。若只是临时测试公网端口，可在 `.env` 中设置：

```dotenv
MALIANG_BIND_ADDRESS=0.0.0.0
MALIANG_PORT=8787
```

生产环境不建议直接开放 `8787`。

## Nginx 和 HTTPS

复制 `deploy/nginx/shenbi-maliang.conf` 到 `/etc/nginx/sites-available/maliang`，把 `ai.example.com` 替换为真实域名：

如果直播导播部署在独立域名，还要把模板中的 `https://live.example.com` 替换为直播页真实来源。该来源只允许嵌入 `/live-demo`，分享、OAuth、上传等敏感页面仍禁止嵌入。

```bash
sudo ln -s /etc/nginx/sites-available/maliang /etc/nginx/sites-enabled/maliang
sudo nginx -t
sudo systemctl reload nginx
```

再申请证书：

```bash
sudo certbot --nginx -d ai.example.com
```

应用启动后进入 `https://ai.example.com/config` 初始化管理员密码，并在后台站点设置中填写公开访问地址 `https://ai.example.com`。易支付异步通知和分享链接会使用这个公开地址。

## 日常命令

```bash
# 查看状态与日志
docker compose ps
docker compose logs -f maliang

# 重启应用
docker compose restart maliang

# 更新代码并重建镜像
git pull origin feature/commercial-billing
docker compose up -d --build
```

应用日志同时写入 Docker 标准输出和宿主机持久化目录：

```text
data/logs/server-YYYY-MM-DD.log
data/logs/error-YYYY-MM-DD.log
```

查看当天完整日志：

```bash
tail -f data/logs/server-$(date +%F).log
```

只查看警告和错误：

```bash
tail -f data/logs/error-$(date +%F).log
```

日志默认保留 14 天，可在 `.env` 中通过 `LOG_RETENTION_DAYS` 调整。日志内容会对常见 API Key、Token、密码和 Authorization Header 做脱敏。

Compose 会强制将应用数据目录固定为 `/app/data`，并单独挂载日志目录。如果服务器之前使用过旧 Compose 配置，更新后执行：

```bash
mkdir -p data/logs
docker compose down
docker compose up -d --build --force-recreate
docker compose config | grep -A8 -B3 GPT_IMAGE_DATA_DIR
docker compose exec maliang sh -lc 'printf "data=%s\\nlogs=%s\\n" "$GPT_IMAGE_DATA_DIR" "$(ls -ld /app/data/logs)"'
```

宿主机日志目录必须是启动 Compose 命令时所在项目目录下的 `data/logs`，不要在其他目录执行 Compose。

## Gemini 流式图片排障

如果请求日志显示 HTTP 200、已接收几十 MB 响应体，但最终出现 `The socket connection was closed unexpectedly`，通常是 Linux 容器中的 Bun Fetch 对上游 close-delimited SSE 结束方式判断过严。当前版本的 Gemini 图片流已改用 Node `http/https` 流读取；更新后必须重建并强制重建容器，不能只执行 restart：

```bash
docker compose up -d --build --force-recreate
docker compose ps
docker compose logs -f --tail=300 maliang
```

确认新镜像启动后，再发起一次请求。重点查看：

```bash
docker compose logs --since=30m maliang | grep -E "Gemini 图片流阶段耗时|图片流已完整接收|socket|responseBytes"
```

HTTP 200 表示上游已经接受并返回内容；不要连续手动重试，否则可能重复扣费。

## 备份与恢复

更新、迁移服务器或清理容器前，备份整个 `data/`：

```bash
tar -czf maliang-data-$(date +%F-%H%M).tar.gz data/
```

恢复时先停止容器，将备份还原到项目根目录的 `data/`，再启动：

```bash
docker compose down
tar -xzf maliang-data-backup.tar.gz
docker compose up -d
```

不要运行 `docker compose down -v`，也不要删除项目根目录的 `data/`。
