<p align="center">
  <img src=".github/logo.png" alt="大肥鱼" width="160" height="160">
</p>

<h1 align="center">serverless-agent-gateway</h1>

<p align="center">
  <a href="https://serverless-agent.cnday.cn"><img src="https://img.shields.io/badge/%E5%AE%98%E7%BD%91-serverless--agent.cnday.cn-2f5de6" alt="官网"></a>
  <a href="https://github.com/zhanxin-xu/serverless-agent-gateway/actions/workflows/ci.yml"><img src="https://github.com/zhanxin-xu/serverless-agent-gateway/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/node-24.x-339933?logo=node.js&amp;logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&amp;logoColor=white" alt="TypeScript">
</p>

一个部署在 Vercel Functions 上的多渠道 AI 机器人网关。QQ、Telegram 或任意 HTTP 客户端通过 Webhook 把消息推进来，网关跑一个带工具调用的 agent loop，再从原渠道把回复发回去。

仓库自带一个示例人设「大肥鱼」：一个嘴毒、爱抬杠的群友。改一个文件就能换成你自己的机器人。

官网：[serverless-agent.cnday.cn](https://serverless-agent.cnday.cn)（源码在 [`site/`](site/)，作为独立的 Vercel 项目部署）。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fzhanxin-xu%2Fserverless-agent-gateway&env=OPENAI_RESPONSES_API_KEY&envDescription=API%20key%20for%20an%20OpenAI%20Responses%20API%20server%20(OpenRouter%20by%20default))

## 特性

- **多渠道接入**：QQ（单聊、群聊、频道，Ed25519 验签）、Telegram、通用 HTTP。所有渠道实现同一个适配器接口，新增渠道只需要写一个对象。目前只有 QQ 在真实环境里跑过，Telegram 和 HTTP 只有离线测试，见[渠道接入](docs/channels.md)。
- **事件流架构**：参照 DeepSeek dsh 的会话日志，每个聊天一条只追加的事件流，消息、模型输出（含思维链）、工具调用和结果全部入库，模型输入从中推导，提示词缓存持续命中。上下文到 20 万 token 自动压缩。
- **一个聊天一个 agent**：收消息和跑 agent 解耦。几个人同时发消息只会有一个 agent 来回答；回复过程中来的新消息，下一步就能看到。
- **为 Serverless 设计**：先回执、后处理（`waitUntil`），平台重推靠共享存储去重；每次模型和工具调用都按函数剩余时间限时，一轮做不完就交给新的函数（内部的 `/api/worker`）接着做，函数中途被杀也能从事件流恢复。
- **任意 Responses API 模型**：直接调用 `POST /responses`，默认走 OpenRouter。请求体可以透传任意参数，比如锁定供应商、设置推理强度。
- **像真人一样聊天**：用 `send_message` 分几条连发、用 `reply_to` 回复指定的消息，用 `end_turn` 主动挂断，会发表情包；在群里能旁观没 @ 它的消息，自己判断要不要插话。
- **看图、听语音**：图片缩小后入库，以前的图片也能再看；QQ 语音使用平台自带的转写文字。
- **长期记忆**：基于 Upstash Vector 的语义检索，所有聊天共用一个记忆库，并记录每条记忆的来源。
- **沙盒工作区**：在 Vercel Sandbox 里跑 bash、Python、Node，每个聊天有一块自己的持久盘，能读图、能把文件发回聊天。
- **联网**：DeepSeek 搜索和网页抓取，另有余额和额度查询工具。
- **画图、修图**：通过 OpenRouter 的 Image API 生成图片，可以把群友发来的照片当参考图来改，结果直接发回聊天。
- **发语音**：用固定的萌系嗓音（Fish Audio Drama 3 克隆）把文字念出来，支持用 `[语气]` 指挥演绎，在 QQ 里是能直接播放的语音条。
- **免费额度就能跑**：Vercel Hobby 加 Supabase、Upstash Vector 的免费版即可运行，资源消耗见[部署文档](docs/deployment.md#免费额度与资源消耗)。

## 工作原理

```
 QQ / Telegram / HTTP
         │ Webhook
         ▼
 /api/webhook/:channel ── 验签 → 立即回执
         │ waitUntil
         ▼
 去重 → 写入事件流 → 要不要唤起？ ── 已有 agent 在跑：结束
                         │ 抢到锁
                         ▼
          每一步：读事件流 → 调用模型 → 输出和工具结果写回事件流
                         │ 这个函数的时间不够：POST /api/worker（带着运行锁），新的函数接着这一轮做
                         │
      OpenRouter Responses API · Supabase · Upstash Vector · Vercel Sandbox
```

## 快速开始

1. **部署**：点击上方的 Deploy 按钮，或者克隆仓库后运行 `npx vercel`。
2. **设置管理密码、连接数据库**：在 Vercel 项目里添加环境变量 `ADMIN_PASSWORD`，在 Storage 页面添加 Supabase（会自动注入数据库连接），然后重新部署。
3. **打开管理端**：访问 `https://<你的域名>/admin`，按新手引导一步步来：建表、填模型 Key、接渠道、发条消息试试。其余配置都在管理端里填，改完不用重新部署，见[管理端](docs/admin.md)。也可以照旧用环境变量配置，见[配置参考](docs/configuration.md)。
4. **接入渠道**：按[渠道接入](docs/channels.md)配置回调地址。QQ 机器人有两个最容易踩的坑：
   - **在中国大陆必须绑定自定义域名**：QQ 开放平台访问不了 `*.vercel.app`，回调地址会校验失败，原因见[部署文档](docs/deployment.md#自定义域名)。
   - **想让机器人看到群里没 @ 它的消息**：除了订阅 `GROUP_MESSAGE_CREATE`，还要群主在手机 QQ 里给机器人"设置权限"，开启"接收全量消息"，每个群单独开。

   其他问题见 [QQ 常见的坑](docs/channels.md#常见的坑)。

## 文档

| 文档 | 内容 |
|---|---|
| [部署](docs/deployment.md) | Vercel 部署、存储、自定义域名、免费额度与资源消耗 |
| [管理端](docs/admin.md) | 新手引导、配置存进数据库、聊天记录与事件流、代发、每群额度 |
| [渠道接入](docs/channels.md) | QQ、Telegram、HTTP 的配置方法，QQ 被动回复和主动消息，如何新增渠道 |
| [Agent 与对话](docs/agent.md) | 事件流格式、一个聊天一个 agent、挂断机制、步数与时间、上下文压缩、崩溃恢复 |
| [模块](docs/modules.md) | 模块、能力与实现；系统提示怎么拼；如何新增模块和实现 |
| [工具](docs/tools.md) | 各模块的工具、长期记忆、沙盒工作区、表情包 |
| [配置参考](docs/configuration.md) | 全部环境变量及默认值 |

## 自定义

| 想改什么 | 改哪里 |
|---|---|
| 人设：她是谁、长相、声音、表情包、示例 | [`src/personas/dafeiyu/`](src/personas/dafeiyu/)；换人设在部署的组合里换 |
| 每一轮怎么决策 | [`src/prompt/rules.ts`](src/prompt/rules.ts) |
| 某个工具怎么用 | 它所在模块的说明，比如 [`src/modules/memory/index.ts`](src/modules/memory/index.ts) |
| 新增工具、模块 | [`src/modules/`](src/modules/)，见[模块](docs/modules.md) |
| 换一家服务、加渠道、换存储 | [`src/adapters/`](src/adapters/)，见[模块](docs/modules.md)、[新增渠道](docs/channels.md#新增渠道) |
| 部署在哪、装哪些模块和实现 | [`deploy/`](deploy/)：每种部署一个组合 |
| 表情包 | [`src/personas/dafeiyu/stickers.ts`](src/personas/dafeiyu/stickers.ts) |

## 本地开发

需要 Node.js 24。

```bash
npm install
cp .env.example .env.local   # 填写需要的变量
npm run dev                  # 本地 Node 部署（deploy/node）：http://localhost:3000/admin
npm test                     # 离线端到端测试，不调用任何真实接口
npm run typecheck
```

本地是一种独立的部署（`deploy/node`）：常驻进程，没有函数时限，也不需要 `/api/worker` 接力。QQ、Telegram 用 webhook 推消息，平台必须能访问到这台机器，可以用 `cloudflared tunnel` 或 `ngrok` 把 3000 端口暴露出去；HTTP 渠道直接可用。

## 项目结构

```
src/                     核心 + 适配器 + 人设（同一个仓库，按层分目录，测试守住边界）
  composition.ts         组合：部署交给核心的东西（宿主、人设、模块、实现、渠道、存储、管理端文案）
  webhook.ts             路由：选择适配器 → 验签解析 → 回执 → 后台处理（Host.background）
  health.ts              配置自检
  config.ts              配置：管理端 → 环境变量 → 默认值
  settings/              存在数据库里的配置
    catalog.ts           汇总组合里每个模块、实现、渠道、宿主声明的配置项
    service.ts           加载、保存、各项配置的来源
  chats/                 每个聊天：回复方式、模块开关、额度、聊天记录
  admin/                 管理端（接口 + ui/ 页面，原生 JS，没有构建步骤）
  channels/              渠道接口：types.ts（ChannelAdapter）、消息头格式、网络重试
  runtime/               运行时：入口、采样、运行者、锁、发件箱；时限和接力问宿主（Host）
  conversation/          事件流：格式、推导模型输入、崩溃恢复
  agent/                 模型这一侧：agent loop、时间预算、Responses API、上下文压缩
  prompt/                系统提示：有名字、有序号的段落，人设从组合里读
  modules/               模块：一组工具 + 说明它们的段落 + 配置 + 背后的能力接口
    types.ts / registry.ts / capability.ts   模块、能力、实现的接口；检查、开关、选实现
    chat/ basics/ model/ search/ memory/ sandbox/ image/ voice/
  store/                 存储接口（types.ts）和内存实现（本地与测试）
  media/                 图片下载缩小、WAV、读取随部署打包的文件
  adapters/              第三方适配：一家厂商一个目录，里面按实现的接口分，只依赖核心
    deepseek/search/     搜索模块的实现
    upstash-vector/memory/   长期记忆模块的实现
    vercel-sandbox/sandbox/  沙盒模块的实现
    openrouter/          image/ 画图模块的实现；model-account.ts 聊天模型 key 的余额；key.ts 两者共用
    openai-speech/voice/ 语音模块的实现（Fish / Seed 写法）
    supabase/store/      存储实现（PostgresStore）和建表（Database）；config.ts 连接
    qq/ telegram/ http/  渠道（各自带配置项；QQ 的 SILK 编码在 qq/silk.ts）
  personas/
    dafeiyu/             人设：提示词、示例、表情包、形象图和声音的路径
deploy/                  部署：每种一个组合 + 宿主 + 管理端文案
  vercel/                Vercel Functions：waitUntil、maxDuration、/api/worker 接力
  node/                  常驻 Node 服务：npm run dev / npm start
api/                     Vercel 的函数入口，只转给 deploy/vercel
  webhook/[channel].ts   POST /api/webhook/{qq|telegram|http}
  worker.ts              POST /api/worker：一轮做不完时由新的函数接着做（内部，凭运行锁）
  health.ts              GET /api/health
  admin.ts               /admin 页面和 /api/admin/* 接口
assets/                  人设的参考声音和形象图
supabase/schema.sql      Supabase 适配器的表和函数
scripts/
  selftest.ts            离线端到端测试（按 Vercel 部署组合）
  moduletest.ts          模块、提示词和分层边界测试
  storetest.ts           存储契约测试（内存，以及设置 TEST_DATABASE_URL 时的真实 Postgres）
  loadtest.ts            每个文件先加载也不出错（npm run test:load）
  rpc-shim.ts            测试用的 Supabase Data API 替身
  sandbox-smoke.ts       用真实 Vercel Sandbox 跑一遍工作区工具
docs/                    详细文档
```

## 参与贡献

欢迎提交 Issue 和 Pull Request，开始之前请先阅读[贡献指南](CONTRIBUTING.md)。发现安全问题时，请按[安全策略](SECURITY.md)私下报告，不要公开提 Issue。

## 致谢

示例人设使用的「蓝色大肥鱼 / DeepSeek 娘」表情包来自社区整理的 [梗鲸 GengJing · 蓝色大肥鱼表情包档案馆](https://aigengtu.com)（[GitHub](https://github.com/the-beating-light-of-the-nail/deepseek-chan-meme-pack)）。本仓库不包含任何图片文件，只按原站公开的直链规则引用，版权说明见[工具文档](docs/tools.md#表情包出处与版权)。

## 许可证

代码采用 [MIT](LICENSE) 许可证。MIT 只适用于代码，不适用于引用的表情包。
