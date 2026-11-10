# 配置参考

下面的配置都可以在[管理端](admin.md)（`/admin`）里填写，存进数据库，改完 30 秒内生效，不用重新部署。每一项按这个顺序取值：**管理端 → 同名环境变量 → 默认值**，所以也可以照旧只用环境变量。直接改环境变量时，需要**重新部署**才会生效。

只能用环境变量设置的有：`ADMIN_PASSWORD`（管理端密码）、数据库连接（`SUPABASE_URL`、`SUPABASE_SECRET_KEY`、`POSTGRES_URL_NON_POOLING`，或 `DATABASE_URL`、`POSTGRES_URL`），以及函数的时间上限 `AGENT_MAX_DURATION_SECONDS`。

本地开发时把变量写进 `.env.local`，模板见 [`.env.example`](../.env.example)。

## 实现的配置怎么命名

模块背后的服务由“实现”提供（[模块](modules.md)）。部署在组合里列出每个模块有哪些实现，一个实现可以按不同的服务地址组合成好几个实例，每个实例有自己的配置和 Key，互不覆盖：同一家服务商的模型和画图可以用两个 Key，也可以填同一个。

实现的配置名是 `模块_实例_字段`，例如 `MODEL_OPENROUTER_API_KEY`、`IMAGE_OPENROUTER_API_KEY`、`SEARCH_DEEPSEEK_API_KEY`。用哪个实例由模块的 `*_PROVIDER` 选，只有一个配好时不用选。例外是集成自动注入的变量（Upstash 的 `UPSTASH_VECTOR_REST_*`）：沿用集成给的名字。

## 模型

模型模块的实现是 pi-ai：通过 [pi-ai](https://github.com/earendil-works/pi) 支持四种接口协议。Vercel 部署组合了这些实例：

| 实例（`MODEL_PROVIDER`） | 默认协议 | 默认地址 | 默认模型 |
|---|---|---|---|
| `openrouter` | `openai-responses` | `https://openrouter.ai/api/v1` | `openai/gpt-6-luna` |
| `openai` | `openai-responses` | `https://api.openai.com/v1` | — |
| `anthropic` | `anthropic-messages` | `https://api.anthropic.com` | — |
| `gemini` | `google-generative-ai` | `https://generativelanguage.googleapis.com/v1beta` | — |
| `deepseek` | `openai-completions` | `https://api.deepseek.com` | — |
| `custom` | `openai-completions` | （自己填） | — |

每个实例的配置（`{实例}` 换成上表的名字，大写，如 `MODEL_ANTHROPIC_API_KEY`）：

| 变量 | 说明 |
|---|---|
| `MODEL_{实例}_API_KEY` | API Key（必填） |
| `MODEL_{实例}_MODEL` | 模型 ID，格式以服务商为准（OpenRouter 是 `厂商/模型`） |
| `MODEL_{实例}_API` | 接口协议：`openai-responses`、`openai-completions`、`anthropic-messages`、`google-generative-ai` |
| `MODEL_{实例}_BASE_URL` | 协议的根地址，不含接口路径。OpenAI 两种填到 `/v1`，Anthropic 不带 `/v1`，Gemini 带版本 |
| `MODEL_{实例}_EXTRA_BODY` | JSON 对象，合并进每次请求的请求体，见下文 |
| `MODEL_{实例}_EXTRA_HEADERS` | JSON 对象，作为额外的请求头，例如 `{"X-Title":"my-bot"}` |
| `MODEL_{实例}_MAX_OUTPUT_TOKENS` | 单次最多输出（含思维链）。不填时只有 Anthropic 带上限（它必须有，用 32000） |
| `MODEL_{实例}_PRICE_INPUT` / `_PRICE_CACHED` / `_PRICE_OUTPUT` | 美元 / 百万 token。服务不在响应里报花费时，用它们估算每个聊天的花费（每群额度按它算）。OpenRouter 会报花费，可以不填 |

模型模块自己的配置：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MODEL_PROVIDER` | 空 | 用哪个实例。只有一个配好时不用填 |
| `MODEL_TIMEOUT_MS` | `280000` | 单次模型请求的超时上限（毫秒）。运行中还会按函数剩余时间缩短（剩余时间减 20 秒），取两者较小的 |

`MODEL_{实例}_EXTRA_BODY` 按所选协议的字段名写，思维链也在这里开：

```bash
# OpenRouter：锁定供应商、禁止回退、推理强度
MODEL_OPENROUTER_EXTRA_BODY='{"provider":{"only":["openai"],"allow_fallbacks":false},"reasoning":{"effort":"high"}}'
# Anthropic：自适应思考
MODEL_ANTHROPIC_EXTRA_BODY='{"thinking":{"type":"adaptive"}}'
# Gemini：合并进请求的 config
MODEL_GEMINI_EXTRA_BODY='{"thinkingConfig":{"includeThoughts":true}}'
```

消息、系统提示、工具、工具选择由网关生成，写进来会报错。JSON 写错时调用也会报错。

换实例、协议、服务地址或模型后，之前的思维链不再回传（只保留文字和工具调用），提示词缓存从头开始。

**余额**：实例知道自己是哪家时用自己的 Key 去查（Vercel 部署里只有 `openrouter` 能查）。两个模块用的是同一个 Key 时，总览只显示一格，工具结果会注明和哪个模块共用。

## Agent

| 变量 | 默认值 | 说明 |
|---|---|---|
| `AGENT_TIMEZONE` | `Asia/Shanghai` | 消息头里时间使用的时区 |
| `AGENT_MAX_STEPS` | `40` | 一轮最多调用模型的次数（旁观轮次也一样；不插话时只用 1 次） |
| `AGENT_MAX_DURATION_SECONDS` | `300` | Vercel 部署：函数的时间上限，要和 `packages/vercel/vercel.json` 的 `maxDuration` 保持一致。剩余不到 100 秒时不开新的一步，交给新的 worker 接着做，见[步数与时间](agent.md#步数与时间)。只能用环境变量 |
| `AGENT_CONTEXT_TOKENS` | `200000` | 上下文预算（token）。请求输入超过它的 80% 时，较早的对话会被压缩成摘要，见[上下文压缩](agent.md#上下文压缩) |
| `AGENT_AMBIENT_INTERVAL_SECONDS` | `10` | 群里没 @ 的消息，每个群每隔多少秒最多唤起一次 agent；`0` 表示只记录、不唤起 |

每次唤起，模型看到的都是这个聊天的完整事件流（超过预算的部分已压缩）。在很热闹的群里，旁观唤起的频率直接决定模型费用，见[资源消耗](deployment.md#免费额度与资源消耗)。

## 管理端

| 变量 | 默认值 | 说明 |
|---|---|---|
| `ADMIN_PASSWORD` | 空 | 管理端密码，只能用环境变量设置。不设置时管理端打不开 |
| `CHAT_DEFAULT_MODE` | `normal` | 没单独设置过的聊天怎么回复：`normal`、`mention`（只回 @）、`record`（只记录）、`block`（屏蔽），见[每个聊天的设置](admin.md#每个聊天的设置) |

## 渠道

| 变量 | 默认值 | 说明 |
|---|---|---|
| `QQ_APP_ID` | 空 | QQ 机器人的 AppID |
| `QQ_APP_SECRET` | 空 | QQ 机器人的 AppSecret，同时用于派生 Webhook 验签密钥 |
| `TELEGRAM_BOT_TOKEN` | 空 | Telegram Bot Token |
| `TELEGRAM_WEBHOOK_SECRET` | 空 | 调用 `setWebhook` 时传的 `secret_token` |
| `TELEGRAM_BOT_USERNAME` | 空 | 机器人用户名（不带 @）。群里只回复 @ 它的消息；不配置时群里不回复 |
| `HTTP_CHANNEL_TOKEN` | 空 | 通用 HTTP 渠道的 Bearer Token；为空时该渠道关闭 |

没有配置凭据的渠道会返回 503，`/api/health` 的 `channels` 字段会显示为 `false`。

## 存储

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SUPABASE_URL` | 空 | Supabase 项目地址，Vercel Marketplace 集成会自动注入 |
| `SUPABASE_SECRET_KEY` | 空 | 服务端密钥（`sb_secret_…`），集成会自动注入 |
| `UPSTASH_VECTOR_REST_URL` / `UPSTASH_VECTOR_REST_TOKEN` | 空 | Upstash Vector，用于长期记忆；为空时记忆工具不启用 |

没配置 Supabase 时退化为内存存储：单实例能用，但多实例之间历史不共享，锁、去重和采样也会失效。Supabase 需要先执行 [`packages/adapters/src/supabase/schema.sql`](../packages/adapters/src/supabase/schema.sql)，见[部署文档](deployment.md#存储supabase)。聊天数据保留多久见[数据保留](deployment.md#存储supabase)。

## 模块开关

每个可选模块一个全局开关，默认开；关掉后所有聊天都不提供它，依赖它的模块也跟着关（画图依赖沙盒）。一般在管理端的模块页切换。

| 变量 | 可选值 | 说明 |
|---|---|---|
| `MODULE_MEMORY` | `on`（默认）、`off` | 长期记忆 |
| `MODULE_SEARCH` | `on`（默认）、`off` | 搜索 |
| `MODULE_SANDBOX` | `on`（默认）、`off` | 沙盒 |
| `MODULE_IMAGE` | `on`（默认）、`off` | 画图 |
| `MODULE_VOICE` | `on`（默认）、`off` | 语音 |

## 模块用哪家服务

每个模块背后的服务可以有多个实现或实例，同一时间只用一个（见[模块](modules.md)）。下面这些配置项选用哪个，一般在管理端模块页的“实现”下拉框里选。不填时用配好了的那一个。

| 变量 | Vercel 部署的可选值 | 说明 |
|---|---|---|
| `MODEL_PROVIDER` | `openrouter`、`openai`、`anthropic`、`gemini`、`deepseek`、`custom` | 模型，见上文 |
| `SEARCH_PROVIDER` | `deepseek` | 搜索模块（`web_search`、`web_fetch`） |
| `VOICE_PROVIDER` | `openrouter` | 语音模块（`send_voice`） |
| `IMAGE_PROVIDER` | `openrouter` | 画图模块（`generate_image`） |
| `MEMORY_PROVIDER` | `upstash` | 长期记忆模块。记忆存在服务那边，换实现后旧记忆看不到 |
| `SANDBOX_PROVIDER` | `vercel` | 沙盒模块。工作区文件存在服务那边，换实现后旧文件看不到 |

## 工具

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SEARCH_DEEPSEEK_API_KEY` | 空 | 搜索模块的 DeepSeek 实现：启用 `web_search`、`web_fetch`、`get_search_balance` |
| `SEARCH_DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek 接口地址 |
| `SANDBOX_VERCEL_ENABLED` | 自动 | 部署在 Vercel 上或本地有 `VERCEL_OIDC_TOKEN` 时自动启用；设为 `0` 关闭，设为 `1` 强制启用 |
| `SANDBOX_VERCEL_REGION` | `iad1` | 沙盒和工作区盘所在的区域。盘建好以后区域不能再改，请在第一次使用前设置 |
| `SANDBOX_COMMAND_TIMEOUT_SECONDS` | `60` | 单条 `bash` 命令的时间上限，临近函数时限时会自动缩短 |
| `STICKER_BASE_URL` | 梗鲸 CDN | 表情包图片的根地址，自托管时修改。属于“聊天”模块，在它的模块页里改 |

## 画图

画图模块的 OpenRouter 实现（实例 `openrouter`，`POST {IMAGE_OPENROUTER_BASE_URL}/images`）。配置了 `IMAGE_OPENROUTER_API_KEY` 并且沙盒模块开着时才启用（生成的图要存进工作区，再用 `send_file` 发出去）。变量名后半段和接口字段一致。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `IMAGE_OPENROUTER_API_KEY` | 空 | 图像接口的 API Key，不设置时不启用画图。和模型的 Key 是分开的两项，填不同的 Key 或同一个都可以 |
| `IMAGE_OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | 请求发到 `{IMAGE_OPENROUTER_BASE_URL}/images` |
| `IMAGE_OPENROUTER_MODEL` | `openai/gpt-image-2.6-sunburst` | 图像模型 |
| `IMAGE_OPENROUTER_QUALITY` | `low` | 对应接口的 `quality`：`auto`、`low`、`medium`、`high`、`xhigh`、`max`。只能在这里设，模型不能自己调高，因为它决定价格 |
| `IMAGE_OPENROUTER_RESOLUTION` | 空（不发） | 对应接口的 `resolution`：`512`、`768`、`1K`、`1.5K`、`2K`、`4K`，只对支持它的模型有用（看 OpenRouter `GET /api/v1/images/models` 里模型的 `supported_parameters`）。默认的 gpt-image 系列**不支持**，发了也会被忽略，按画幅出约 1024px 的图（1024×1024、1024×1536、1536×1024）。结果都会再缩到 1920×1080 以内（横竖都算）再保存 |
| `IMAGE_OPENROUTER_EXTRA_BODY` | 空 | JSON 对象，合并进请求体，例如 `{"provider":{"options":{"openai":{"moderation":"low"}}}}` |
| `IMAGE_OPENROUTER_TIMEOUT_MS` | `180000` | 单次请求的超时时间（毫秒），临近函数时限时会自动缩短 |
| `IMAGE_SELF_REFERENCE` | `assets/persona/dafeiyu.webp` | 大肥鱼的形象图：部署包里的文件路径（相对 `packages/vercel/`）或 https 链接，画她自己时作为参考图（`include_self`）。填 `none` 关闭。新文件要放进 `packages/vercel/assets/`（`vercel.json` 会整个打包），体积尽量小 |

## 语音

语音模块的 OpenAI 兼容实现，一个服务地址一个实例；Vercel 部署组合了 `openrouter` 实例（`POST {VOICE_OPENROUTER_BASE_URL}/audio/speech`），默认是 OpenRouter 上的 Fish Audio Drama 3。配置了 `VOICE_OPENROUTER_API_KEY` 才启用。变量名后半段和接口字段一致。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VOICE_OPENROUTER_API_KEY` | 空 | 语音接口的 API Key，不设置时不启用语音。和其他模块的 Key 是分开的两项，填同一个也可以 |
| `VOICE_OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | 请求发到 `{VOICE_OPENROUTER_BASE_URL}/audio/speech` |
| `VOICE_OPENROUTER_MODEL` | `fish-audio/drama-3` | 语音模型，模型调用工具时不能改。已适配 `fish-audio/drama-3` 和 `bytedance-seed/seed-audio-1-0`（工具描述会教对应的写法）；换别的模型要确认它支持 `pcm` 输出，克隆声音还要支持 `input_references` |
| `VOICE_OPENROUTER_VOICE` | 空 | 对应接口的 `voice`，填服务商的音色 ID。只在不克隆（模型选了音色 `none`，或没有参考音频）时发送 |
| `VOICE_OPENROUTER_REFERENCE_AUDIO` | `assets/voice/dafeiyu.mp3` | 要克隆的声音：部署包里的文件路径（相对 `packages/vercel/`），或 https 链接；填 `none` 不克隆。新文件要放进 `packages/vercel/assets/`，体积尽量小（单声道、32 kbps 左右的 mp3 就够） |
| `VOICE_OPENROUTER_REFERENCE_TEXT` | 内置参考音频的文字稿 | 参考音频说的话，有助于克隆。换了参考音频要一起改，不填就不发 |
| `VOICE_OPENROUTER_SING_REFERENCE_AUDIO` | 空 | 可选：同一个声音**唱歌**的参考音频（文件或 https 链接）。设置后模型多一个音色 `self_sing` 可选 |
| `VOICE_OPENROUTER_SING_REFERENCE_TEXT` | 空 | 唱歌参考音频里唱的词 |
| `VOICE_OPENROUTER_INSTRUCTIONS` | 空 | 对应接口的 `instructions`：每条语音都带的语气，例如 `软萌可爱的小女孩`。模型调用时给的 `instructions` 会接在后面 |
| `VOICE_OPENROUTER_EXTRA_BODY` | 空 | JSON 对象，合并进请求体，例如 `{"speed":1.1}` |
| `VOICE_OPENROUTER_TIMEOUT_MS` | `120000` | 单次请求的超时时间（毫秒），临近函数时限时会自动缩短 |
