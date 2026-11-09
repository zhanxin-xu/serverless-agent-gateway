# 模块

机器人的每样本事是一个**模块**：一组工具，加上告诉模型怎么用它们的一段说明。模块开启时，它的工具和说明才会出现在发给模型的请求里；没配置好、依赖没满足、或者在某个聊天里被关掉的模块，工具和说明都不出现。

设计和取舍见 [`docs/design/modules.md`](design/modules.md)；重构前后的提示词逐行对比见 [`docs/design/prompt-migration-report.md`](design/prompt-migration-report.md)（重构时的一次性记录）。

## 三层：模块、能力、实现

```
模块 Module ──使用──▶ 能力 Capability ──选出一个──▶ 实现 Provider
```

- **模块**：模型看到的东西。它的工具、说明它们的提示词段落、每日额度、余额查询、检查。是聊天里开关和计量的单位。
- **能力**：模块背后的一类外部服务，有统一的接口，比如搜索是 `search(query)` 和 `fetch(url)`。
- **实现**：能力的一个具体服务商，带自己的配置项，比如 DeepSeek。**同一时间只用一个**，换实现不改变模型看到的工具名和参数。

| 模块 | 核心 | 能力 | 第一个实现 | 依赖 | 工具 | 额度 |
|---|---|---|---|---|---|---|
| 聊天 `chat` | 是 | — | — | — | `send_message` `send_sticker` `end_turn` `chat_members` | — |
| 小工具 `basics` | 是 | — | — | — | `get_current_time` `calculate` | — |
| 模型 `model` | 是 | — | — | — | `get_llm_key_limit` | — |
| 长期记忆 `memory` | | 记忆存储 | Upstash Vector | — | `remember` `recall` `forget` | — |
| 搜索 `search` | | 搜索服务 | DeepSeek | — | `web_search` `web_fetch` `get_search_balance` | 搜索（次） |
| 沙盒 `sandbox` | | 沙盒服务 | Vercel Sandbox | — | `bash` `read_file` `write_file` `send_file` `save_attachment` | — |
| 画图 `image` | | 画图服务 | OpenRouter Image API | 沙盒 | `generate_image` `get_image_key_limit` | 画图（张） |
| 语音 `voice` | | 语音服务 | OpenAI 兼容语音接口 | — | `send_voice` | 语音（条） |

**余额归各自的模块**：模型 key 由“模型”模块的 `get_llm_key_limit` 查，画图 key 由“画图”模块的 `get_image_key_limit` 查（和模型共用一个 key 时它会直接说明），搜索余额由“搜索”模块的 `get_search_balance` 查（只有能查余额的搜索实现才提供）。管理端总览也是逐个模块列余额。

## 一个模块什么时候开启

按顺序判断（`src/modules/registry.ts` 的 `moduleStatus`）：

1. 它的能力选得出一个实现（见下面的选择规则）。
2. 它自己的 `ready()` 说可以（没有能力的模块用这个）。
3. 它 `requires` 的模块都开着。
4. 在某个聊天里：这个聊天没关掉它（聊天设置里的 `disabledModules`）。

管理端的“模块”页、引导页和 `/api/health` 的 `modules` 字段都会写出没开启的原因。

**选实现的规则**（`src/modules/capability.ts`，照搬 DeepSeek Harness 的 web 服务）：

| 情况 | 结果 |
|---|---|
| `*_PROVIDER` 指定了实现，且它配置齐了 | 用它 |
| 指定了，但没有这个实现 | 不开启：“选的是 X，但没有这个实现” |
| 指定了，但它配置不全 | 不开启：说明缺什么 |
| 没指定，恰好一个实现配置齐了 | 用它 |
| 没指定，一个都没有 | 不开启：说明缺什么 |
| 没指定，有多个配置齐了 | 不开启：请在配置页选一个 |

## 系统提示怎么拼

`src/prompt/assemble.ts` 把系统提示拼成有名字、有序号的段落，按序号从小到大排，空段丢掉。序号统一在 `src/prompt/order.ts`：

| 序号 | 段落 | 内容 |
|---|---|---|
| 0 | `persona` | 人设：身份、长相、性格、说话方式、底线（`src/prompt/persona.ts`） |
| 1000 | `rules` | 业务规则：每一轮怎么决策、你看到的信息（`src/prompt/rules.ts`） |
| 2000 | `scene` | 私聊或群聊 |
| 3000 | `channel` | 渠道格式（QQ：纯文本……） |
| 5000–5600 | `module:<id>` | 每个开启的模块一段 |
| 9000 | `chat:extra` | 这个聊天的额外设定 |

规则：

- **人设和业务规则里不出现任何工具名**，由测试保证。“记仇爱翻旧账”写在人设里；“用 remember 记下来”只写在记忆模块里。
- **模块的段落看本轮实际给模型的工具来写**：段落函数拿到 `ctx.has(工具名)`，只有那个工具在场时才提它。比如语音段落里“好用的组合可以用 remember 记下来”只在记忆模块开着时出现。
- **段落和工具定义一起组装**：运行时、上下文压缩、管理端的预览、测试都调同一个 `assemble()`，看到的就是模型收到的。
- **变量**：段落里可以写 `{{bot_name}}`，在 `src/prompt/variables.ts` 定义；没定义的变量会直接报错，不会把有问题的提示词发出去。
- **同一个聊天、配置不变时，拼出来的提示词逐字相同**，保证模型服务商的提示词缓存命中。
- **语音是唯一由实现影响提示词的地方**：Fish 用行内标签，Seed 不能写标签，所以语音实现提供 `dialect()`，同时用在工具描述和语音段落里。

管理端里：“模块”页可以展开看每个模块的段落原文和工具定义；聊天的“设置与额度”页底部可以看这个聊天实际拼出来的完整系统提示和工具。

## 新增一个模块

1. 建 `src/modules/<id>/`：
   - `tools.ts`：工具（`Tool`，见 `src/modules/tool.ts`）。
   - `index.ts`：模块定义。
   - 依赖外部服务的话，再加 `capability.ts`（统一接口和实现列表）、`providers/<实现>/`、`settings.ts`。
2. 在 `src/prompt/order.ts` 的 `ORDER.module` 里给它一个序号。
3. 把它加进 `src/modules/registry.ts` 的 `MODULES`。
4. 有配置项的话，把它的 `settings.ts` 加进 `src/settings/catalog.ts` 的 `MODULE_SETTINGS`。
5. 在 `src/modules/types.ts` 的 `ModuleId` 里加上它的 id。

```ts
// src/modules/weather/index.ts
import { ORDER } from "../../prompt/order.js";
import type { Module } from "../types.js";
import { weatherCapability } from "./capability.js";
import { getWeather } from "./tools.js";

export const weatherModule: Module = {
  id: "weather",
  label: "天气",
  summary: "get_weather 查某个城市的天气。",
  capability: weatherCapability,
  settings: "weather",                 // 模块自己的配置分组（里面有 WEATHER_PROVIDER）
  tools: [getWeather],
  section: {
    order: ORDER.module.weather,
    text: () => "# 查天气\n\n- 有人问天气，先调 get_weather，别凭印象说。",
  },
  // 可选：meter（每日额度）、balance（余额）、check（管理端的检查按钮）、requires（依赖的模块）
};
```

提示词、聊天里的开关、额度、管理端的模块页和配置页都会自动跟上。

## 给一个能力新增实现

以搜索加一个 Exa 为例：

1. 建 `src/modules/search/providers/exa/`：
   - `settings.ts`：纯数据，只能 `import type`。一个配置分组（`provider: { capability: "search", id: "exa" }`、`essentials` 写引导页要问的几项）和它的配置项，比如 `EXA_API_KEY`。
   - `config.ts`：用 `settingValue` 等读取配置。
   - `client.ts`：实现 `SearchBackend`（`search`、`fetch`，能查余额的话加 `balance`）。
   - `index.ts`：`Provider` 定义，`available()` 只看配置填没填，不发网络请求。
2. 加进 `src/modules/search/capability.ts` 的 `providers`。
3. 把 `settings.ts` 加进 `src/settings/catalog.ts` 的 `MODULE_SETTINGS`。

`SEARCH_PROVIDER` 的下拉选项、配置页的实现卡片、选择规则都会自动包含它。工具名和参数不变，所以模型和历史记录都不受影响。

**有状态的能力**（记忆、沙盒，`stateful: true`）：数据存在实现那边，换实现后旧数据看不到。配置页会提示这一点；迁移数据的流程见设计文档 9.6。

## 不能改的标识

这些已经写进数据库或事件日志，改名就要迁移历史数据：

- **工具名**：用量统计按事件流里的工具名找模块，模型也会在历史里看到自己调过的工具。
- **模块 id**：存在每个聊天的设置里。
- **额度 key**（`images`、`voices`、`searches`）：存在每日用量和每个聊天的额度里。
- **配置项名**：同时也是环境变量名。

## 测试

- `npm test` 跑 `scripts/selftest.ts`（端到端）和 `scripts/moduletest.ts`（模块、选择规则、提示词组装、迁移）。
