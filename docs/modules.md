# 模块

机器人的每样本事是一个**模块**：一组工具，加上告诉模型怎么用它们的一段说明。模块开启时，它的工具和说明才会出现在发给模型的请求里；关掉的、没配置好的、依赖没满足的、或者在某个聊天里被关掉的模块，工具和说明都不出现。

设计和取舍见 [`docs/design/modules.md`](design/modules.md)。

## 分层与组合

代码分四层，都在这一个仓库里，按目录分开，由测试（`scripts/moduletest.ts` 的 layers）守住依赖方向：

| 层 | 目录 | 能依赖 |
|---|---|---|
| 核心 | `src/`（除了下面两个） | 只有核心。不出现任何具体的服务商、渠道、存储、宿主或人设 |
| 适配器 | `src/adapters/<服务>/` | 核心，和自己目录 |
| 人设 | `src/personas/<名字>/` | 只有 `Persona` 类型：是数据 |
| 部署 | `deploy/<部署>/` | 以上全部，不依赖别的部署；`api/` 只转给 `deploy/vercel` |

部署通过 **组合**（`src/composition.ts` 的 `compose()`，相当于 dsh 的 `cordis.yml`）把这些交给核心，核心只从组合里读：

| 组合里的 | 是什么 | Vercel 部署 | 本地 Node 部署 |
|---|---|---|---|
| `host` | 宿主：后台任务、一次运行能跑多久、跑不完时怎么接力、自己的配置项、CDN 缓存头 | `waitUntil`、`maxDuration`、签名请求 `/api/worker`、`WORKER_SECRET` | 常驻进程，每次运行最长 `AGENT_RUN_BUDGET_SECONDS`（默认 30 分钟），不接力 |
| `persona` | 人设 | 大肥鱼 | 大肥鱼 |
| `modules` | 加载哪些模块、什么顺序 | 全部 8 个 | 全部 8 个 |
| `providers` | 各能力的实现 | DeepSeek、Upstash Vector、Vercel Sandbox、OpenRouter 画图、OpenAI 兼容语音 | 同左 |
| `modelAccount` | 怎么查聊天模型 key 的余额（没有就没有 `get_llm_key_limit`） | OpenRouter `/key` | 同左 |
| `channels` | 渠道 | QQ、Telegram、HTTP | 同左（QQ、Telegram 需要公网地址或隧道） |
| `store` / `database` | 存储，以及管理端怎么给它建表 | 配了 Supabase 用 Supabase，否则内存 | 同左 |
| `guide` | 管理端里随部署变的文案：怎么设管理密码、怎么连数据库 | Vercel 控制台的步骤 | `.env.local` 的步骤 |

管理端跟着部署走：配置页列出的是组合里的模块、实现、渠道和宿主的配置项（Vercel 部署才有“Vercel”分组），引导页的密码和数据库步骤来自 `guide`，数据库状态来自 `database`，标题和头像来自人设。

组合里的东西都在 `compose()` 之后才读，所以文件加载的先后无所谓。新增一种部署：在 `deploy/<名字>/` 写一个 `Host`、一个组合和入口。

## 三层：模块、能力、实现

```
模块 Module ──使用──▶ 能力 Capability ──选出一个──▶ 实现 Provider
```

- **模块**：模型看到的东西。它的工具、说明它们的提示词段落、配置、每日额度、余额查询、检查。是开关、聊天里的开关和计量的单位。
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

**余额归各自的模块**：模型 key 由“模型”模块的 `get_llm_key_limit` 查，画图 key 由“画图”模块的 `get_image_key_limit` 查（和模型共用一个 key 时它会直接说明），搜索余额由“搜索”模块的 `get_search_balance` 查（只有能查余额的搜索实现才提供）。管理端总览逐个模块列余额。

## 模块怎么定义（参照 DeepSeek Harness 的插件）

dsh 的插件是一个导出 `name`、`inject`、`Config` 和 `apply(ctx)` 的模块，由组合清单 `cordis.yml` 决定加载哪些；框架本身不认识任何具体插件。这里是同一个思路的轻量版：

| dsh 插件 | 这里的模块（`src/modules/types.ts` 的 `Module`） |
|---|---|
| `name` | `id`：唯一、不改名（存在聊天设置和额度里） |
| `inject`：依赖的服务，不在就不加载 | `requires`：依赖的模块；`capability`：用的外部服务 |
| `Config`：配置定义和默认值，随插件一起走 | `config`：自己的配置分组和配置项；实现也各带 `config` |
| `apply(ctx)` 里 `ctx.tools.register` | `tools` |
| `apply(ctx)` 里 `ctx.systemPrompt.section` | `section`：提示词段落和它的位置（在 `ORDER.modules` 范围内，不能和别人重） |
| `cordis.yml`：加载哪些插件 | 部署的组合（`deploy/<部署>/composition.ts`）：加载哪些模块和实现 |
| 加载时调用 `apply` | 每个模块是一个函数，`compose()` 在所有文件加载完、人设就位之后调用一次 |
| 只能访问 `inject` 声明过的服务 | 只能引用 `requires` 声明过的模块的 `index.ts`（测试检查） |

一个模块目录：

```
src/modules/<id>/
  index.ts          模块定义：export function <id>Module(): Module { return { … } }
  tools.ts          工具
  settings.ts       配置：export const CONFIG: ConfigDecl = { group, settings }
  capability.ts     （依赖外部服务时）统一接口；实现列表从组合里取

src/adapters/<服务>/   一个实现（适配器层）
  index.ts          实现定义：{ id, capability, config, available(), create() }
  settings.ts       实现的配置
  config.ts         读配置
  client.ts         调用服务
```

由模块定义自动得到、不用另外登记的：

- **配置**：配置目录（`src/settings/catalog.ts`）从组合里收集每个模块、实现、渠道和宿主的 `config`，自动标上属于哪个模块、哪个实现、哪个渠道。
- **开关**：每个可选模块自动有一个 `MODULE_<ID>` 配置项（默认开），加在它自己的配置分组里。
- **选实现**：`capability` 的选择配置项（比如 `SEARCH_PROVIDER`）的选项自动列出它的实现。
- **聊天里的开关、每日额度**：从可选模块和它们的 `meter` 得到。
- **管理端**：模块列表、模块页、引导页里的“可选模块”，以及标了 `setup: "required"` 的模块在引导页单独一步（现在是“模型”）。
- **检查**：模块写了 `check`，管理端对应的配置分组上就有“检查”按钮。

模块定义在加载时检查：id、工具名、提示词位置、计量的计数名都不能重复；`requires` 的模块必须存在；`meter` 只能计自己的工具；核心模块不能依赖可能不存在的外部服务。有错时网关启动就报错，而不是在对话里出问题。

**加载顺序**：配置目录读组合里的模块，模块读 `config.ts`，`config.ts` 读配置目录，互相引用。所以任何文件在加载时都不能读别的文件的导出值，也不能读组合：模块是函数、能力的实现列表是 getter、用到人设的默认值在模块定义或 getter 里读。`npm run test:load` 会把每个文件都单独“第一个加载”一遍再组合，确认不会出错。

## 人设和模块分开

人设是组合里的一项（`Persona`，`src/composition.ts`），现在的是 `src/personas/dafeiyu/`：

- `prompt.ts`：她是谁，系统提示的第一段。
- `index.ts`：导出 `dafeiyu: Persona`：名字、给图像模型的长相描述、形象图、自己声音的参考音频和文字稿、表情包、示例。
- `stickers.ts`：她的表情包。
- `examples.ts`：她用各个模块工具的示例，按模块 id 分组，只在那个模块开启时出现。

核心里（包括模块、提示词、管理端）不出现她的名字和长相（测试检查），需要时读 `persona()`：画图的 `include_self` 用她的形象图和长相描述，语音默认克隆她的声音（音色名是 `self`、`self_sing`），`send_sticker` 发她的表情包（人设没有表情包就没有这个工具），`{{bot_name}}` 和管理端标题是她的名字，管理端头像由她的形象图缩出来。形象图、声音、表情包都可以不提供。换一个人设：新建 `src/personas/<名字>/`，在部署的组合里换掉。

## 一个模块什么时候开启

按顺序判断（`src/modules/registry.ts` 的 `moduleStatus`）：

1. 它的开关开着：每个可选模块有一个全局开关 `MODULE_<ID>`（比如 `MODULE_SEARCH`），默认 `on`，在管理端的模块页切换。核心模块没有开关。
2. 它的能力选得出一个实现（见下面的选择规则）。
3. 它自己的 `ready()` 说可以（没有能力的模块用这个，比如“模型”要填了 API Key）。
4. 它 `requires` 的模块都开着。
5. 在某个聊天里：这个聊天没关掉它（聊天设置里的 `disabledModules`）。

管理端的模块页、引导页和 `/api/health` 的 `modules` 字段都会写出没开启的原因。

**选实现的规则**（`src/modules/capability.ts`，照搬 DeepSeek Harness 的 web 服务）：

| 情况 | 结果 |
|---|---|
| 选择配置项（`*_PROVIDER`）指定了实现，且它配置齐了 | 用它 |
| 指定了，但没有这个实现 | 不开启：“选的是 X，但没有这个实现” |
| 指定了，但它配置不全 | 不开启：说明缺什么 |
| 没指定，恰好一个实现配置齐了 | 用它 |
| 没指定，一个都没有 | 不开启：说明缺什么 |
| 没指定，有多个配置齐了 | 不开启：请在模块页选一个 |

管理端里就是模块页上的一个下拉框，选中哪个用哪个。

## 系统提示怎么拼

`src/prompt/assemble.ts` 把系统提示拼成有名字、有序号的段落，按序号从小到大排，空段丢掉。核心段落的位置在 `src/prompt/order.ts`：

| 序号 | 段落 | 内容 |
|---|---|---|
| 0 | `persona` | 人设：身份、长相、性格、说话方式、底线（组合里的 `Persona.prompt`） |
| 1000 | `rules` | 业务规则：每一轮怎么决策、你看到的信息（`src/prompt/rules.ts`） |
| 2000 | `scene` | 私聊或群聊 |
| 3000 | `channel` | 渠道格式（QQ：纯文本……） |
| 5000–7999 | `module:<id>` | 每个开启的模块一段，位置由模块自己定 |
| 8000 | `examples` | 人设的示例，只含开启的模块的 |
| 9000 | `chat:extra` | 这个聊天的额外设定 |

规则：

- **人设和业务规则里不出现任何工具名**；**模块里不出现人设**。两条都由测试保证。
- **模块的段落看本轮实际给模型的工具来写**：段落函数拿到 `ctx.has(工具名)`，只有那个工具在场时才提它。比如语音段落里“好用的组合可以用 remember 记下来”只在记忆模块开着时出现。
- **段落和工具定义一起组装**：运行时、上下文压缩、管理端的预览、测试都调同一个 `assemble()`，看到的就是模型收到的。
- **变量**：段落里可以写 `{{bot_name}}`（人设的名字），在 `src/prompt/variables.ts` 定义；没定义的变量会直接报错。
- **同一个聊天、配置不变时，拼出来的提示词逐字相同**，保证模型服务商的提示词缓存命中。
- **语音是唯一由实现影响提示词的地方**：Fish 用行内标签，Seed 不能写标签，所以语音实现提供 `dialect()`，同时用在工具描述和语音段落里。

管理端里：模块页可以展开看每个模块的段落原文和工具定义；聊天的“设置与额度”页底部可以看这个聊天实际拼出来的完整系统提示和工具。

## 新增一个模块

1. 建 `src/modules/<id>/`，写 `tools.ts`、`settings.ts`（可选模块必须有，开关加在这个分组里）和 `index.ts`。
2. 在 `src/modules/index.ts` 导出它，再加进部署的组合（`deploy/<部署>/composition.ts` 的 `modules`）。

```ts
// src/modules/weather/index.ts
import type { Module } from "../types.js";
import { weatherCapability } from "./capability.js";
import { CONFIG } from "./settings.js";
import { getWeather } from "./tools.js";

/** Called once by compose() (src/composition.ts), after every file has loaded and the persona is in place. */
export function weatherModule(): Module {
  return {
    id: "weather",
    label: "天气",
    summary: "get_weather 查某个城市的天气。",
    capability: weatherCapability,
    config: CONFIG, // 里面有 WEATHER_PROVIDER；开关 MODULE_WEATHER 自动加上
    tools: [getWeather],
    section: { order: 5700, text: () => "# 查天气\n\n- 有人问天气，先调 get_weather，别凭印象说。" },
    // 可选：meter（每日额度）、balance（余额）、check（管理端的检查按钮）、requires（依赖的模块）
  };
}
```

想给人设加这个模块的示例，在 `src/personas/dafeiyu/examples.ts` 里加 `weather: [...]`。

## 给一个能力新增实现

以搜索加一个 Exa 为例：

1. 建 `src/adapters/exa/`（适配器只依赖核心）：
   - `settings.ts`：`CONFIG`，一个配置分组（`essentials` 写引导页要问的几项）和它的配置项，比如 `EXA_API_KEY`。
   - `config.ts`：用 `settingValue` 等读取配置。
   - `client.ts`：实现 `SearchBackend`（`search`、`fetch`，能查余额的话加 `balance`）。
   - `index.ts`：`{ id: "exa", capability: searchCapability.id, config: CONFIG, available(), create() }`，`available()` 只看配置填没填，不发网络请求。
2. 加进部署的组合（`deploy/<部署>/composition.ts` 的 `providers`）。

模块页的下拉框、选择配置项的选项、配置页都会自动包含它。工具名和参数不变，所以模型和历史记录都不受影响。

**有状态的能力**（记忆、沙盒，`stateful: true`）：数据存在实现那边，换实现后旧数据看不到，模块页会提示；迁移数据的流程见设计文档 9.6。

## 不能改的标识

这些已经写进数据库或事件日志，改名就要迁移历史数据：

- **工具名**：用量统计按事件流里的工具名找模块，模型也会在历史里看到自己调过的工具。
- **模块 id**：存在每个聊天的设置里，也是开关配置项名的一部分。
- **额度 key**（`images`、`voices`、`searches`）：存在每日用量和每个聊天的额度里。
- **配置项名**：同时也是环境变量名。

## 测试

- `npm test`：`scripts/selftest.ts`（端到端）和 `scripts/moduletest.ts`（模块定义检查、引用边界、人设分离、选择规则、提示词组装）。
- `npm run test:load`：每个文件单独“第一个加载”，确认互相引用不会在加载时出错（慢，一个文件一个进程）。
