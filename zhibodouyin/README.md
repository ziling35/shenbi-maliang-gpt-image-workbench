# 灵图AI 直播智能导播

这是一个可单独部署的直播演示与智能导播服务，适合抖音直播伴侣或 OBS 采集浏览器窗口。

## 已集成功能

- 使用灵图AI真实界面展示一句话生图、提示词优化、图片续改、灵感空间和作品管理。
- 支持阶跃星辰 StepAudio、火山引擎、腾讯云、阿里云及浏览器自带语音，云语音失败自动降级。
- 支持 OpenAI Chat Completions 兼容接口，由大模型生成场景讲解和弹幕问题回复。
- 统一接收评论、进场、礼物、点赞、关注、粉丝团和直播数据事件。
- 通过 SSE 将弹幕事件和 AI 导播内容实时推送给直播页。
- 对自动欢迎和 AI 回复设置频率限制，避免重复打扰观众。
- 密钥只保存在服务端 `.env`，不会发送到浏览器。

## 启动

```powershell
cd zhibodouyin
Copy-Item .env.example .env
node server.js
```

访问 `http://127.0.0.1:8790`。抖音直播伴侣建议使用窗口采集，画布设置为 `1920 × 1080`。

管理后台地址：`http://127.0.0.1:8790/admin/`。

首次运行时，如果 `.env` 没有设置 `ADMIN_TOKEN`，服务会自动生成管理员令牌并保存在 `data/admin-token.txt`。登录后台时输入该令牌。后台读取配置时不会回显云厂商密钥，保存后立即热更新。

Docker Compose 已把 `./data` 挂载到容器 `/app/data`，重建容器后后台配置和管理员令牌仍会保留。

## Docker

```powershell
cd zhibodouyin
Copy-Item .env.example .env
docker compose up -d --build
```

## 语音配置

在 `.env` 中修改：

```env
TTS_PROVIDER=stepfun
```

可选值：

- `browser`：浏览器中文语音，无需密钥。
- `stepfun`：阶跃星辰 StepAudio 语音合成，支持自然语言控制播报风格。
- `grok2api`：Grok2API Voice，支持原生 `/v1/tts` 和 OpenAI 兼容 `/v1/audio/speech`。
- `volcengine`：火山引擎语音合成。
- `tencent`：腾讯云 TextToVoice。
- `aliyun`：阿里云智能语音交互短文本合成。

然后填写对应供应商配置。没有配置成功时 `/api/config` 会自动把有效供应商回退为 `browser`。每家控制台的音色编号和服务区域可能不同，应以当前账号控制台为准。

### 阶跃星辰 StepAudio

```env
TTS_PROVIDER=stepfun
STEPFUN_TTS_BASE_URL=https://api.stepfun.com/step_plan/v1
STEPFUN_TTS_API_KEY=你新生成的APIKey
STEPFUN_TTS_MODEL=stepaudio-2.5-tts
STEPFUN_TTS_VOICE=cixingnansheng
STEPFUN_TTS_INSTRUCTION=自然亲切的中文主播声音，语速舒适，带轻微微笑感，不要播音腔
STEPFUN_TTS_RESPONSE_FORMAT=mp3
STEPFUN_TTS_SPEED=1
STEPFUN_TTS_VOLUME=1
STEPFUN_TTS_TIMEOUT_MS=60000
```

服务端会在 Base URL 后自动请求 `/audio/speech`。也可以打开管理后台，在“语音播报”中选择“阶跃星辰 StepAudio”并填写以上配置，保存后立即热更新。

API Key 只能保存在服务器 `.env` 或管理后台配置中，不要写入前端、提交到 Git、放进截图或聊天记录。若密钥曾公开，应立即在阶跃星辰控制台撤销并重新生成。

### Grok2API Voice

```env
TTS_PROVIDER=grok2api
GROK_TTS_BASE_URL=http://grok2api.ziling.site/v1
GROK_TTS_API_KEY=g2a_你的APIKey
GROK_TTS_API_MODE=openai
GROK_TTS_MODEL=grok-voice-think-fast-1.0
GROK_TTS_VOICE=eve
GROK_TTS_LANGUAGE=zh
GROK_TTS_RESPONSE_FORMAT=mp3
GROK_TTS_SPEED=1
GROK_TTS_TIMEOUT_MS=60000
```

`GROK_TTS_API_MODE=openai` 请求 `/audio/speech`；设置为 `native` 时请求 `/tts`。管理后台可以保存配置后读取 `/tts/voices` 的实时音色列表，并对当前配置直接试听。API Key 始终由直播服务端代持，不会传给直播页面。

### 火山引擎

```env
TTS_PROVIDER=volcengine
VOLC_TTS_APP_ID=你的AppID
VOLC_TTS_ACCESS_TOKEN=你的AccessToken
VOLC_TTS_CLUSTER=volcano_tts
VOLC_TTS_VOICE_TYPE=zh_female_cancan_mars_bigtts
```

### 腾讯云

```env
TTS_PROVIDER=tencent
TENCENT_TTS_SECRET_ID=你的SecretId
TENCENT_TTS_SECRET_KEY=你的SecretKey
TENCENT_TTS_REGION=ap-guangzhou
TENCENT_TTS_VOICE_TYPE=101001
```

### 阿里云

```env
TTS_PROVIDER=aliyun
ALIYUN_TTS_APP_KEY=你的AppKey
ALIYUN_TTS_TOKEN=有效Token
ALIYUN_TTS_VOICE=xiaoyun
```

阿里云 Token 通常有有效期，生产环境应通过服务端程序定期刷新，而不是把长期账号密钥放进前端。

## 大模型导播

支持所有兼容 `/v1/chat/completions` 的接口：

```env
AI_PROVIDER_NAME=你的模型服务
AI_BASE_URL=https://你的模型网关/v1
AI_API_KEY=你的Key
AI_MODEL=你的文字模型名称
AI_API_MODE=auto
AI_AUTO_REPLY=true
```

`AI_API_MODE` 支持 `auto`、`chat_completions` 和 `responses`。`auto` 会先调用 Chat Completions；如果网关明确提示模型不支持该端点，会自动改用 Responses，避免图片模型或新模型端点不兼容造成首次讲解失败。

大模型用于：

- 当前平台功能切换时生成自然短讲解。
- 识别带问题意图的弹幕并生成简短回答。
- 先回答功能问题，再克制地说明灵图AI可以怎么完成。

直播页还带有安全的“弹幕驱动演示”动作路由：观众询问生图、提示词、模型或图片修改时切换到对话生图；询问案例、模板或灵感时切换到灵感空间；询问历史作品、保存或下载时切换到作品管理。动作限定在白名单场景内，不会自动登录、充值、提交订单或执行真实生成。

默认提示词禁止夸大宣传、收益承诺和重复引流。可通过 `AI_SYSTEM_PROMPT` 覆盖，但仍建议保持直播合规。

## 弹幕事件接口

### 推荐：内置 douyinLive 桥接

灵图AI已经内置 WebSocket 桥接客户端，但抖音直播间消息仍需要独立的 `douyinLive` 采集器提供。Windows 下执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\install-douyin-live.ps1
powershell -ExecutionPolicy Bypass -File .\tools\start-douyin-live.ps1
```

然后在管理后台“弹幕接入”中填写直播间 ID、启用内置桥接并保存。灵图AI会自动连接 `ws://127.0.0.1:1088/ws/直播间ID`，断线后自动重连。Webhook Token 会在首次启动时自动生成，内置桥接不需要使用它。

`douyinLive` 属于第三方开源采集器，其可用性和消息完整性受抖音页面与协议变化影响。生产使用前请自行确认授权、平台规则和适用法律。

### 外部程序 Webhook

```http
POST /api/douyin/events
Authorization: Bearer your-webhook-token
Content-Type: application/json
```

接口兼容 `douyinLive` 和 `DouyinLiveMonitor` 常见的事件名称及扁平字段。这里仅参考其公开事件结构，没有把签名、Cookie 或非官方抓取逻辑嵌入本项目。

### 评论

```json
{
  "method": "WebcastChatMessage",
  "data": {
    "user": { "nick_name": "小明" },
    "content": "怎么生成商品图？"
  }
}
```

### 批量事件

```json
{
  "events": [
    { "type": "member", "user_name": "新观众" },
    { "type": "gift", "user_name": "小红", "gift_name": "小心心", "gift_cnt": 2 },
    { "type": "like", "user_name": "小刚", "count": 10 },
    { "type": "social", "user_name": "小蓝" }
  ]
}
```

支持的标准事件：

- `chat` / `WebcastChatMessage`
- `member` / `WebcastMemberMessage`
- `gift` / `WebcastGiftMessage`
- `like` / `WebcastLikeMessage`
- `social` / `WebcastSocialMessage`
- `fansclub` / `WebcastFansclubMessage`
- `stats` / `WebcastRoomUserSeqMessage`

## 服务接口

- `GET /api/config`：公开品牌、TTS 和 AI 状态，不返回密钥。
- `GET /api/events`：SSE 实时事件流。
- `GET /api/events/history`：最近互动事件。
- `POST /api/tts`：服务端语音合成。
- `POST /api/director/scene`：按预设平台场景生成讲解。
- `POST /api/director/generate`：管理员手动生成并广播讲解，需要 `ADMIN_TOKEN`。
- `POST /api/douyin/events`：弹幕中转入口，需要 `DOUYIN_WEBHOOK_TOKEN`。
- `GET /healthz`：健康检查与供应商状态。

## 合规建议

- 不要尝试规避抖音检测，不伪造在线人数、评论、点赞或礼物。
- 页面用于辅助展示，主播应保持真人在线并真实回应观众。
- 不长时间循环同一段录音，不持续欢迎每一个进场用户。
- 使用官方开放能力、合规服务商或获得授权的程序取得弹幕。
- 不把抖音 Cookie、账号密码、签名密钥或云厂商密钥放在浏览器。
- 最终是否允许及所需权限以开播时适用的抖音规则和各云服务官方文档为准。
