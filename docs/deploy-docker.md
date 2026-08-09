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
