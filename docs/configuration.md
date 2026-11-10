# 配置参考

下面的配置都可以在[管理端](admin.md)（`/admin`）里填写，存进数据库，改完 30 秒内生效，不用重新部署。每一项按这个顺序取值：**管理端 → 同名环境变量 → 默认值**，所以也可以照旧只用环境变量。直接改环境变量时，需要**重新部署**才会生效。

只能用环境变量设置的有：`ADMIN_PASSWORD`（管理端密码）、数据库连接（`SUPABASE_URL`、`SUPABASE_SECRET_KEY`、`POSTGRES_URL_NON_POOLING`，或 `DATABASE_URL`、`POSTGRES_URL`），以及函数的时间上限 `AGENT_MAX_DURATION_SECONDS`。

本地开发时把变量写进 `.env.local`，模板见 [`.env.example`](../.env.example)。

## 实现的配置怎么命名

模块背后的服务由“实现”提供（[模块](modules.md)）。部署在组合里列出每个模块有哪些实现，一个实现可以按不同的服务地址组合成好几个实例，每个实例有自己的配置和 Key，互不覆盖：同一家服务商的模型和画图可以用两个 Key，也可以填同一个。

实现的配置名是 `模块_实例_字段`，例如 `MODEL_OPENROUTER_API_KEY`、`IMAGE_OPENROUTER_API_KEY`、`SEARCH_DEEPSEEK_API_KEY`。用哪个实例由模块的 `*_PROVIDER` 选，只有一个配好时不用选。例外是集成自动注入的变量（Upstash 的 `UPSTASH_VECTOR_REST_*`）：沿用集成给的名字。

## 请求体覆盖

每个发 JSON 请求的实例都有一项 `模块_实例_EXTRA_BODY`（管理端里叫“请求体覆盖”）：模型、画图、语音、搜索、长期记忆。它是一个 JSON 对象，在请求发出前的最后一步，按层级合并进最终的请求体：

- 对象遇到对象：逐个键合并，一层层往下；
- 其他值（字符串、数字、数组）：整个替换；
- `null`：删掉这个字段。

任何字段都能改，网关自己生成的字段（消息、工具、用户标识、`include`）也一样，改坏了请求会出错。比如：

```bash
# 让 OpenAI 存下请求，在后台 Logs 里能看到（对话内容会在 OpenAI 保存 30 天）
MODEL_OPENAI_EXTRA_BODY='{"store":true}'
# 在 pi-ai 的推理参数上只改强度，其余保留
MODEL_OPENAI_EXTRA_BODY='{"reasoning":{"effort":"high"}}'
# 不发旧的 user 字段，只留 safety_identifier
MODEL_OPENAI_EXTRA_BODY='{"user":null}'
```

JSON 写错或不是对象时，调用会报错。实现在 `packages/core/src/modules/shared/body.ts`，各适配器发请求前调用它。

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
| `MODEL_{实例}_EXTRA_BODY` | 请求体覆盖，见下文和[请求体覆盖](#请求体覆盖) |
| `MODEL_{实例}_EXTRA_HEADERS` | JSON 对象，作为额外的请求头，例如 `{"X-Title":"my-bot"}` |
| `MODEL_{实例}_MAX_OUTPUT_TOKENS` | 单次最多输出（含思维链）。不填时只有 Anthropic 带上限（它必须有，用 32000） |
| `MODEL_{实例}_PRICE_INPUT` / `_PRICE_CACHED` / `_PRICE_OUTPUT` | 美元 / 百万 token。服务不在响应里报花费时，用它们估算每个聊天的花费（每群额度按它算）。OpenRouter 会报花费，可以不填 |

模型模块自己的配置：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MODEL_PROVIDER` | 空 | 用哪个实例。只有一个配好时不用填 |
| `MODEL_TIMEOUT_MS` | `280000` | 单次模型请求的超时上限（毫秒）。运行中还会按函数剩余时间缩短（剩余时间减 20 秒），取两者较小的 |
| `MODEL_DAILY_BUDGET_USD` | 空（不限） | 模型每天最多花多少美元，所有聊天加起来，不管用哪个实例，见[花费上限](#花费上限) |
| `MODEL_MONTHLY_BUDGET_USD` | 空（不限） | 每月最多花多少美元 |

`MODEL_{实例}_EXTRA_BODY` 按所选协议的字段名写，覆盖的是 pi-ai 生成的请求，思维链也在这里开：

```bash
# OpenRouter：锁定供应商、禁止回退、推理强度
MODEL_OPENROUTER_EXTRA_BODY='{"provider":{"only":["openai"],"allow_fallbacks":false},"reasoning":{"effort":"high"}}'
# Anthropic：自适应思考
MODEL_ANTHROPIC_EXTRA_BODY='{"thinking":{"type":"adaptive"}}'
# Gemini：覆盖的是 SDK 的请求 { model, contents, config }，生成参数在 config 里
MODEL_GEMINI_EXTRA_BODY='{"config":{"thinkingConfig":{"includeThoughts":true}}}'
```

消息、系统提示、工具、工具选择、用户标识（`safety_identifier`、`user`）由网关生成，覆盖它们要自己保证请求还对。

换实例、协议、服务地址或模型后，之前的思维链不再回传（只保留文字和工具调用），提示词缓存从头开始。

**余额**：实例知道自己是哪家时用自己的 Key 去查（Vercel 部署里只有 `openrouter` 能查）。两个模块用的是同一个 Key 时，总览只显示一格，工具结果会注明和哪个模块共用。

## 花费上限

模型和画图各有一份花费上限，所有聊天加起来算，不管用的是哪个实例；在管理端模块页里各自模块的设置里填：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MODEL_DAILY_BUDGET_USD` / `IMAGE_DAILY_BUDGET_USD` | 空（不限） | 每天最多花多少美元，北京时间 08:00（UTC 0 点）重置。填 0 等于停用 |
| `MODEL_MONTHLY_BUDGET_USD` / `IMAGE_MONTHLY_BUDGET_USD` | 空（不限） | 每月最多花多少美元，每月 1 日北京时间 08:00 重置 |

每次调用结束后，把它花的钱记到这个模块当天的账上（`gateway.spend_daily`），管理端总览每个模块一格，显示今天和本月花了多少、上限多少。用完以后：

- **模型**：不再开始新的一轮。被 @ 或私聊时回一句“今天（这个月）的额度用完了，几点恢复”，没 @ 的消息不插话。和每个聊天自己的花费额度用完时一样。一轮进行到一半用完了，也是这样结束。
- **画图**：`generate_image` 直接报错，不发请求，由模型自己告诉对方。

这是网关自己的限额，不是服务商的：

- **金额是估算的。** 服务商在响应里报了金额就用它（OpenRouter 会报，但用 BYOK 自己的 Key 时报 $0）；没报时，模型按 pi-ai 的价格表估，OpenAI 画图按 `IMAGE_OPENAI_PRICES` 的 token 单价估；两样都没有的调用记 0。
- **可能略超。** 调用结束后才记账，几个调用同时在跑时，都会在额度用完之前放行；每个函数实例还会缓存最多 15 秒的账。
- **管不了网关之外的调用。** Key 泄露后别人直接拿去用，这里看不到，要靠服务商那边：OpenAI 项目的余额（关掉自动充值）、模型白名单和速率限制。

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
| `MEMORY_UPSTASH_EXTRA_BODY` | 空 | [请求体覆盖](#请求体覆盖)，写入、查询、删除都合并 |

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
| `IMAGE_PROVIDER` | `openrouter`、`openai` | 画图模块（`generate_image`） |
| `MEMORY_PROVIDER` | `upstash` | 长期记忆模块。记忆存在服务那边，换实现后旧记忆看不到 |
| `SANDBOX_PROVIDER` | `vercel` | 沙盒模块。工作区文件存在服务那边，换实现后旧文件看不到 |

## 工具

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SEARCH_DEEPSEEK_API_KEY` | 空 | 搜索模块的 DeepSeek 实现：启用 `web_search`、`web_fetch`、`get_search_balance` |
| `SEARCH_DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek 接口地址 |
| `SEARCH_DEEPSEEK_EXTRA_BODY` | 空 | [请求体覆盖](#请求体覆盖)，搜索和抓取两个接口都合并，例如 `{"count":8}` |
| `SANDBOX_VERCEL_ENABLED` | 自动 | 部署在 Vercel 上或本地有 `VERCEL_OIDC_TOKEN` 时自动启用；设为 `0` 关闭，设为 `1` 强制启用 |
| `SANDBOX_VERCEL_REGION` | `iad1` | 沙盒和工作区盘所在的区域。盘建好以后区域不能再改，请在第一次使用前设置 |
| `SANDBOX_COMMAND_TIMEOUT_SECONDS` | `60` | 单条 `bash` 命令的时间上限，临近函数时限时会自动缩短 |
| `STICKER_BASE_URL` | 梗鲸 CDN | 表情包图片的根地址，自托管时修改。属于“聊天”模块，在它的模块页里改 |

## 画图

画图模块有两个实现：OpenRouter（实例 `openrouter`）和 OpenAI 官方（实例 `openai`），用哪个由 `IMAGE_PROVIDER` 选，只配了一个时不用选。花费上限 `IMAGE_DAILY_BUDGET_USD`、`IMAGE_MONTHLY_BUDGET_USD` 见[花费上限](#花费上限)。

### OpenRouter

实例 `openrouter`，`POST {IMAGE_OPENROUTER_BASE_URL}/images`。配置了 `IMAGE_OPENROUTER_API_KEY` 并且沙盒模块开着时才启用（生成的图要存进工作区，再用 `send_file` 发出去）。变量名后半段和接口字段一致。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `IMAGE_OPENROUTER_API_KEY` | 空 | 图像接口的 API Key，不设置时不启用画图。和模型的 Key 是分开的两项，填不同的 Key 或同一个都可以 |
| `IMAGE_OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | 请求发到 `{IMAGE_OPENROUTER_BASE_URL}/images` |
| `IMAGE_OPENROUTER_MODEL` | `openai/gpt-image-2.6-sunburst` | 图像模型 |
| `IMAGE_OPENROUTER_QUALITY` | `low` | 对应接口的 `quality`：`auto`、`low`、`medium`、`high`、`xhigh`、`max`。只能在这里设，模型不能自己调高，因为它决定价格 |
| `IMAGE_OPENROUTER_RESOLUTION` | 空（不发） | 对应接口的 `resolution`：`512`、`768`、`1K`、`1.5K`、`2K`、`4K`，只对支持它的模型有用（看 OpenRouter `GET /api/v1/images/models` 里模型的 `supported_parameters`）。默认的 gpt-image 系列**不支持**，发了也会被忽略，按画幅出约 1024px 的图（1024×1024、1024×1536、1536×1024）。结果都会再缩到 1920×1080 以内（横竖都算）再保存 |
| `IMAGE_OPENROUTER_EXTRA_BODY` | 空 | [请求体覆盖](#请求体覆盖)，例如 `{"provider":{"options":{"openai":{"moderation":"low"}}}}` |
| `IMAGE_OPENROUTER_TIMEOUT_MS` | `180000` | 单次请求的超时时间（毫秒），临近函数时限时会自动缩短 |

### OpenAI

实例 `openai`，OpenAI 官方的 Image API：没有参考图时 `POST {IMAGE_OPENAI_BASE_URL}/images/generations`，有参考图时 `POST /images/edits`（参考图以 URL 或 data URL 发送，最多 16 张）。用户标识作为 `safety_identifier` 原样发给 OpenAI（走 OpenRouter 时它会换成自己的哈希）。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `IMAGE_OPENAI_API_KEY` | 空 | OpenAI 的 API Key，不设置时不启用这个实例 |
| `IMAGE_OPENAI_BASE_URL` | `https://api.openai.com/v1` | 填到 `/v1` 为止 |
| `IMAGE_OPENAI_MODEL` | `gpt-image-2.6-sunburst` | 图像模型 |
| `IMAGE_OPENAI_QUALITY` | `low` | 对应接口的 `quality`，只能在这里设 |
| `IMAGE_OPENAI_EXTRA_BODY` | 空 | [请求体覆盖](#请求体覆盖)，例如 `{"moderation":"low"}` |
| `IMAGE_OPENAI_PRICES` | `{"text_input":5,"image_input":8,"image_output":30}` | 美元 / 百万 token。接口只返回 token 数，花费按它估算。默认是 gpt-image-2.6 的标价 |
| `IMAGE_OPENAI_TIMEOUT_MS` | `180000` | 单次请求的超时时间（毫秒） |

画幅（`aspect_ratio`）换成约一百万像素、宽高都是 16 的倍数的 `size`，比如 16:9 是 `1360x768`；`auto` 让模型自己定（有参考图时跟着参考图）。结果同样缩到 1920×1080 以内再保存。

### 两个实现共用的

| 变量 | 默认值 | 说明 |
|---|---|---|
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
| `VOICE_OPENROUTER_EXTRA_BODY` | 空 | [请求体覆盖](#请求体覆盖)，例如 `{"speed":1.1}` |
| `VOICE_OPENROUTER_TIMEOUT_MS` | `120000` | 单次请求的超时时间（毫秒），临近函数时限时会自动缩短 |
