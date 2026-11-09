# 设计：模块、能力与提示词组装

状态：已全部实施（2026-11-09），见文末“实施记录”
日期：2026-11-09
使用说明：[`docs/modules.md`](../modules.md)
参考：DeepSeek Harness（dsh）的 [`dsh-system-prompt`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/system-prompt/README.md)、[`dsh-web`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/web/web/README.md) 和 [capability seams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)

## 1. 为什么要改

### 1.1 提示词是一整块

`src/agent/system-prompt.ts` 里的 `SYSTEM_PROMPT` 把三类东西写在一起：

- 人设：身份、长相、性格、说话方式、底线。
- 业务规则：每一轮怎么决策、你看到的信息。
- 每个工具的用法：记忆的档案写法、画图的自拍流程、语音的 Fish/Seed 语法、沙盒的附件流程……

后果：

- 某个功能没配置或在某个群里关掉以后，提示词里仍然写着它的工具名和用法。比如关掉记忆后，人设里还是“用 remember 记进档案”，模型会去调一个不存在的工具。
- 改一个工具的用法要在一大段人设里找位置，人设和工具说明互相缠在一起。
- 管理端看不到某个聊天实际发给模型的提示词。

### 1.2 “功能”这个概念散在七个地方

| 位置 | 管什么 |
|---|---|
| `tools/types.ts` 的 `ToolFeature` | 工具属于哪个功能 |
| `tools/registry.ts` | 一张平铺的工具清单 |
| `agent/system-prompt.ts` | 各功能的用法说明 |
| `chats/profile.ts` 的 `PROFILE_CHOICES` | 每个聊天能开关哪些功能、功能的中文名、有哪些额度 |
| `chats/usage.ts` 的 `METERED` | 哪个功能计哪个额度 |
| `settings/catalog.ts` 的 `SETTING_GROUPS` | 功能的配置项、填了哪项算启用（`enabledBy`） |
| `admin/routes/setup.ts` | 引导页里每个功能是否已配置 |

它们靠同样的 id 字符串（`image`、`voice`……）对上，没有一处能说清“一个功能由哪些部分组成”。新增一个功能要改七处，漏一处也不会报错。

### 1.3 同一种功能没法换实现

搜索写死 DeepSeek，记忆写死 Upstash Vector，沙盒写死 Vercel Sandbox。语音的 Fish 和 Seed 是同一个文件里按模型名分的条件分支。想换成 Exa 搜索或 Supabase pgvector 记忆，只能改功能本身的代码。

## 2. 目标与不做的事

**目标**

1. 系统提示由“人设 + 业务规则”做主体，每个模块的使用说明归模块自己。模块在这个聊天里生效时，它的说明才拼进去。
2. “模块”成为唯一的扩展单位：工具、说明、配置、计量、检查都由模块声明。新增一个模块只需建一个目录，再把它加进清单。
3. 同一种能力可以有多个实现，同一时间只用一个，在管理端切换。换实现不改变模型看到的工具名和参数。
4. 线上数据零丢失，迁移可回滚，见第 9 节。
5. 管理端能看到每个模块的状态，以及每个聊天实际拼出来的完整提示词。

**不做**

- 不引入插件容器或依赖注入框架（dsh 用 Cordis）。这里一个模块清单数组就够。
- 不支持运行时从外部安装模块。模块随代码部署。
- 渠道（QQ、Telegram、HTTP）这次不纳入模块体系。它们已有 `ChannelAdapter` 接口，而且可以同时启用多个，和“能力”只选一个不同。第 12 节说明以后怎么套进来。
- 模型（Responses API）本身这次不做成可替换的能力。
- 管理端编辑人设：这次只做预览，不做编辑。

## 3. 概念

```
模块 Module ──使用──▶ 能力 Capability ──选出一个──▶ 实现 Provider
   │                      （统一接口）              （DeepSeek、Exa……）
   ├─ 工具 Tool[]
   ├─ 提示词段落 PromptSection[]
   ├─ 计量 meter
   └─ 依赖 requires（其他模块）
```

| 概念 | 是什么 | 例子 |
|---|---|---|
| 模块 | 一组面向模型的工具和它们的使用说明，是聊天里开关和计量的单位 | 搜索、长期记忆、画图、语音、沙盒，以及核心模块“聊天” |
| 能力 | 模块背后的一类外部服务，有统一接口 | `search`：`search(query)`、`fetch(url)` |
| 实现 | 能力的一个具体服务商，自带配置项 | `deepseek`、以后的 `exa` |
| 段落 | 系统提示里有名字、有序号的一块文字 | `persona`、`rules`、`module:memory` |

规则：

- **模型只认识模块，不认识实现。** 工具名、参数和说明都属于模块，换实现不改变它们。唯一的例外是语音，见 6.3。
- **一个模块最多依赖一种能力。** 核心模块不依赖能力。
- **一种能力同一时间只用一个实现**，选择规则见 6.2。

## 4. 接口

```ts
// src/modules/types.ts

export interface Module {
  /** 稳定 id：存进聊天设置、出现在管理端地址里。永不改名，见 9.1。 */
  id: ModuleId;
  label: string;                 // "长期记忆"
  summary: string;               // 一句话，管理端用
  /** 核心模块始终开启，聊天不能关，不在聊天的开关列表里。 */
  core?: true;
  /** 依赖的其他模块。依赖没生效时本模块整体不生效（例：画图依赖沙盒的存附件和发文件）。 */
  requires?: ModuleId[];
  /** 背后的能力；没有能力的模块（核心模块）只看自己的 ready。 */
  capability?: CapabilityId;
  /** 不依赖能力的模块用它判断配置是否齐全。只看配置，不发网络请求。 */
  ready?(): Readiness;
  tools: Tool[];
  sections?: PromptSection[];
  /** 每日额度。key 必须等于 usage_daily 里已有的计数名，见 9.3。 */
  meter?: { key: QuotaKey; label: string };
}

export type Readiness = { ok: true } | { ok: false; reason: string };

export interface Capability<Impl> {
  id: CapabilityId;              // "search"
  label: string;                 // "搜索服务"
  /** 存选择的配置项，例如 SEARCH_PROVIDER。 */
  selectionSetting: string;
  providers: Provider<Impl>[];
  /** 选择会丢数据的能力（记忆、沙盒）切换时要走迁移流程，见 9.6。 */
  stateful?: true;
}

export interface Provider<Impl> {
  id: string;                    // "deepseek"，存进 SEARCH_PROVIDER
  label: string;                 // "DeepSeek"
  description: string;           // 适合什么、花多少钱，设置页显示
  /** 这个实现自己的配置分组（settings/catalog 里的 group）。 */
  settings: SettingGroupId;
  /** 配置齐了吗：只看 key 有没有填，不发网络请求，保证选择又快又确定。 */
  available(): Readiness;
  /** 真正的客户端，实现能力的统一接口。 */
  create(): Impl;
  /** 可选：给模块说明补一段这个实现特有的写法，见 6.3。 */
  dialect?(): string;
  /** 可选：管理端“检查”按钮，会真的发一次请求。 */
  check?(): Promise<CheckResult>;
  /** 可选：有状态的能力用来迁移数据，见 9.6。 */
  exportData?(): AsyncIterable<Record<string, unknown>>;
  importData?(items: AsyncIterable<Record<string, unknown>>): Promise<number>;
}
```

`Tool` 接口去掉 `feature` 字段，工具属于哪个模块由模块清单决定。`role`、`historyLine`、`run` 不变。

## 5. 提示词组装

### 5.1 段落注册表

照搬 dsh 的做法：提示词由有名字、有序号的段落组成，按序号从小到大拼接，空段丢掉。

```ts
// src/prompt/types.ts
export interface PromptSection {
  name: string;                  // "persona" "module:memory"
  order: number;                 // 只能用 prompt/order.ts 里分配的值
  text(ctx: AssemblyContext): string;   // 返回 "" 就不出现
}

export interface AssemblyContext {
  chatType: "private" | "group";
  channel: ChannelAdapter;
  profile: ChatProfile;
  /** 本轮实际给模型的工具（已经过模块开关、依赖和配置筛选）。 */
  toolset: Toolset;
  modules: ActiveModule[];       // 本轮生效的模块和它们选中的实现
}

// src/prompt/assemble.ts
export function assemble(ctx: AssemblyContext): Assembly;
export interface Assembly {
  sections: { name: string; order: number; source: string; text: string }[];
  tools: ToolDefinition[];       // Responses API 的 tools
  prompt: string;                // sections 拼好的全文
}
```

**段落和工具定义一起组装**（dsh 的原话是“告诉模型它能做什么”是一件完整的事）。运行时（`runtime/runner.ts`）、压缩（`agent/compaction.ts`）、管理端预览和测试都调同一个 `assemble()`，四处看到的一定是同一份。

### 5.2 序号分配

序号集中定义在 `src/prompt/order.ts`，彼此留出间隔，以后插段不用重排：

| 序号 | 段落名 | 内容 | 来源 |
|---|---|---|---|
| 0 | `persona` | 身份、长相、性格与雷点、说话方式、底线 | `prompt/persona.ts` |
| 1000 | `rules` | 每一轮怎么决策、怎么用工具干活、你看到的信息 | `prompt/rules.ts` |
| 2000 | `scene` | 这个聊天：私聊或群聊二选一 | `prompt/rules.ts` |
| 3000 | `channel` | 渠道格式（QQ：纯文本……） | `ChannelAdapter.promptHint` |
| 5000 | `module:chat` | 发消息、reply_to / quote、@#编号、表情包 | 核心模块 |
| 5100 | `module:basics` | 时间、计算、查模型余额 | 核心模块 |
| 5200 | `module:memory` | 档案写法、先查后说、隐私底线 | 记忆模块 |
| 5300 | `module:search` | 先查再说、查不到直说、查余额 | 搜索模块 |
| 5400 | `module:sandbox` | 工作区、附件原图、发文件 | 沙盒模块 |
| 5500 | `module:image` | 自拍、修图、生成后检查再发 | 画图模块 |
| 5600 | `module:voice` | 何时发语音、写法（含实现的 dialect）、唱歌、变声 | 语音模块 |
| 9000 | `chat:extra` | 这个聊天的额外设定 | 聊天设置 `profile.prompt` |

### 5.3 段落的规则

1. **人设和业务规则里不出现任何工具名。** “记仇爱翻旧账”留在人设里；“用 remember 记进档案”只写在记忆模块里。由测试保证：`persona`、`rules`、`scene` 段里不能出现任何已注册的工具名。
2. **模块说明按工具集写。** 说明是函数，拿到 `ctx.toolset`。只在某个工具确实在工具集里时，才提它。例如画图说明里的“生成后用 send_file 发出去”，只在 `send_file` 在场时写。跨模块的引用因此不会写错。
3. **示例归模块。** 现在“典型反应示例”里用到语音、记忆的那两条，搬进对应模块的段落。只用发消息和表情包的示例留在 `rules`，因为这两样属于核心模块，始终在场。
4. **变量。** 段落里可以写 `{{bot_name}}`、`{{timezone}}`，组装时替换。有未替换的变量就直接报错，不把有问题的提示词发给模型（dsh 的做法）。变量在 `prompt/variables.ts` 一处定义。
5. **同一个聊天、配置不变时，组装结果逐字相同。** 段落顺序固定；模块按注册顺序；段落文字里不放时间、计数这类会变的东西（时间在消息头里）。这保证模型服务商的提示词缓存命中，由测试锁住。

### 5.4 拼出来的样子（群聊，全部模块生效）

```
# 身份 …                       ← persona
# 核心人设与雷点 …
# 说话方式 …
# 底线 …
# 每一轮怎么自主决策 …          ← rules
# 典型反应示例（只用发消息和表情包的几条）
# 你看到的信息 …
# 这个聊天 这是群聊…            ← scene
This is QQ: reply in plain text…  ← channel
# 发消息与表情包 …              ← module:chat
# 长期记忆 … 示例：立 flag 记档案   ← module:memory
# 搜索 …                        ← module:search
# 沙盒工作区与附件 …            ← module:sandbox
# 画图与自拍 …                  ← module:image
# 语音 … 写法（Fish）：…        ← module:voice + 实现的 dialect
# 这个聊天的额外设定 …          ← chat:extra
```

## 6. 能力与实现

### 6.1 第一版的能力和实现

| 能力 | 统一接口 | 第一版实现 | 选择配置项 | 有状态 |
|---|---|---|---|---|
| `search` | `search(query)`、`fetch(url)`、可选 `balance()` | `deepseek` | `SEARCH_PROVIDER` | 否 |
| `speech` | `speak({ text, instructions, voice, mode, speed })` | `openai-speech`（OpenAI 兼容 `/audio/speech`，默认 OpenRouter） | `VOICE_PROVIDER` | 否 |
| `image` | `generate({ prompt, references, … })` | `openrouter-images` | `IMAGE_PROVIDER` | 否 |
| `vector-memory` | `upsert`、`query`、`delete` | `upstash-vector` | `MEMORY_PROVIDER` | 是 |
| `sandbox` | `workspace(chat)`：`exec`、`read`、`write` | `vercel-sandbox` | `SANDBOX_PROVIDER` | 是 |

每种能力第一版只有一个实现，所以选择配置项不填也会自动选中它（见 6.2），线上行为完全不变。新增实现（比如 Exa 搜索）只需写 `providers/exa/` 并加进能力的 `providers`，模块、提示词和管理端都不用动。

### 6.2 选择规则

照搬 dsh-web 的规则，不按加载顺序随便挑：

| 情况 | 结果 |
|---|---|
| 指定了实现，且它可用 | 用它 |
| 指定了实现，但没有这个实现 | 不可用：“指定的 X 不存在” |
| 指定了实现，但它的配置不全 | 不可用：“X 缺少 …” |
| 没指定，恰好一个实现可用 | 用它 |
| 没指定，没有实现可用 | 不可用：“没有配置任何实现” |
| 没指定，多个实现可用 | 不可用：“有多个可用的实现，请在配置页选一个” |

“不可用”的能力，它的模块整体不生效：工具和说明都不出现。原因显示在管理端的模块页和引导页上。

### 6.3 dialect：唯一允许实现影响提示词的地方

语音的写法真的随模型而变：Fish 用行内标签 `[得意地]`、`<whisper>`；Seed 不能写任何标签，语气要写进 `instructions`。这不是工具接口能抹平的，所以：

- `Provider.dialect()` 返回一小段写法说明，由语音模块拼进自己段落的固定位置，同时也拼进 `send_voice` 工具的描述。
- 现在 `voice.ts` 里的 `FISH`、`SEED`、`GENERIC` 三套写法，移到 `openai-speech` 实现内部，按 `TTS_MODEL` 选择。它们是同一个服务商的不同模型，不是不同实现。
- 其他能力的实现不允许提供 dialect。

### 6.4 实现自带配置项

现在所有配置项都在 `settings/catalog.ts` 一个文件里。改为：

- 每个实现在自己目录下有一个 `settings.ts`，只放纯数据（配置项定义），不 import 任何东西。
- `catalog.ts` 汇总“核心配置项 + 所有实现的配置项”。`config.ts` 仍然从 catalog 读默认值，依赖方向不变。
- 用测试检查这些 `settings.ts` 没有任何 import，防止循环依赖。
- 原来 `config.ts` 里的 `image`、`tts`、`memory`、`sandbox`、`deepseek` 几段类型化读取，搬进对应实现的 `config.ts`。`config.ts` 只留模型、Agent、渠道、管理端这些核心部分。

配置项名字（也就是环境变量名）一个都不改，见 9.2。

## 7. 模块清单

| 模块 | 核心 | 能力 | 依赖 | 工具（名字永不改） | 额度 key | 现在的位置 |
|---|---|---|---|---|---|---|
| `chat` | 是 | — | — | `send_message` `send_sticker` `chat_members` `end_turn` | — | `tools/chat.ts` `tools/stickers.ts` |
| `basics` | 是 | — | — | `get_current_time` `calculate` `get_llm_key_limit` | — | `tools/utility.ts` `tools/account.ts` |
| `memory` | | `vector-memory` | — | `remember` `recall` `forget` | — | `tools/memory.ts` |
| `search` | | `search` | — | `web_search` `web_fetch` `get_search_balance`（实现支持 `balance()` 时才有） | `searches` | `tools/web.ts` `tools/account.ts` |
| `sandbox` | | `sandbox` | — | `bash` `read_file` `write_file` `send_file` `save_attachment` | — | `tools/sandbox/` |
| `image` | | `image` | `sandbox` | `generate_image` | `images` | `tools/image.ts` |
| `voice` | | `speech` | — | `send_voice` | `voices` | `tools/voice.ts` |

现在 `image.enabled()` 里写死了 `config.sandbox.enabled`，以后改由 `requires: ["sandbox"]` 表达。

## 8. 目录

```
src/modules/
  types.ts                模块、能力、实现的接口
  registry.ts             模块清单；resolve(profile) → 本轮生效的模块、选中的实现、工具集
  capabilities.ts         能力清单和选择规则（6.2）
  chat/                   核心
    index.ts  tools.ts  stickers.ts  guide.ts
  basics/                 核心
  memory/
    index.ts  tools.ts  guide.ts
    capability.ts         VectorMemory 接口
    providers/upstash-vector/
      index.ts  settings.ts  config.ts  client.ts
  search/
    providers/deepseek/
  sandbox/
    providers/vercel-sandbox/
  image/
    providers/openrouter-images/
  voice/
    providers/openai-speech/
      index.ts  settings.ts  config.ts  client.ts  dialects.ts   ← FISH / SEED / GENERIC
src/prompt/
  types.ts  order.ts  variables.ts
  persona.ts              人设（不含工具名）
  rules.ts                业务规则 + 私聊 / 群聊
  assemble.ts             组装（5.1）
```

删除：`src/tools/`（内容按上表搬走，`Tool`、`ToolContext` 等类型移到 `src/modules/tool.ts`）、`src/agent/system-prompt.ts`。

## 9. 数据迁移

原则：**先扩展，再迁移，最后收缩。** 每一步上线后都能回滚到上一版代码而不丢数据、不改变行为。数据库的结构升级仍然由管理员在管理端点“升级到 vN”触发（执行 `supabase/schema.sql`，全部幂等），所以新代码必须在升级前的数据库上也能正确运行。

### 9.1 永不改名的标识

下面这些已经写进数据库或事件日志，改名就要迁移历史数据，所以定为永久契约：

| 标识 | 存在哪里 | 用途 |
|---|---|---|
| 工具名（`web_search` 等） | `gateway.events` 的 `tool/call`、`assistant/message` | 用量统计按工具名找模块；聊天记录按工具名渲染旧消息；模型在历史里看到自己调过的工具 |
| 模块 id（`image` `voice` `search` `memory` `sandbox`） | `gateway.chat_profiles` | 每个聊天关掉了哪些模块 |
| 额度 key（`images` `voices` `searches` `cost_usd`） | `gateway.usage_daily.counts`、`chat_profiles.quota` | 每日计数和上限 |
| 配置项名（环境变量名） | `gateway.settings`、Vercel 环境变量、`admin_log` | 配置值 |

万一以后非改不可，要同时迁移事件日志和聊天设置里的旧值。（原先设计的 `aliases` 别名机制没有用上，已删除。）

### 9.2 配置（`gateway.settings`）

- 现有的 key 一个不改、一个不删。取值顺序（管理端 → 环境变量 → 默认值）不变。所以 Vercel 上已经设的环境变量继续生效。
- 新增五个选择配置项：`SEARCH_PROVIDER`、`VOICE_PROVIDER`、`IMAGE_PROVIDER`、`MEMORY_PROVIDER`、`SANDBOX_PROVIDER`。默认都是空，空表示自动选择（6.2）。因为每种能力目前只有一个实现，升级后自动选中原来的服务，**不需要写任何数据**。
- 以后新实现的配置项用新名字（例如 `EXA_API_KEY`），和现有的不冲突。
- 配置分组的 id（`tts` 等）只出现在管理端地址里（`#/config/tts`），不存数据库，可以改。旧地址重定向到新地址。
- 回滚：旧代码不认识这五个新 key。`settings/service.ts` 的 `valuesOf` 本来就只加载 catalog 里有的 key，所以旧代码会忽略它们。

### 9.3 每个聊天的设置（`gateway.chat_profiles.profile`）

现在：`{ "title", "mode", "ambientIntervalSeconds", "disabledTools": ["image", "memory"], "prompt", "quota": {…} }`

目标：字段改名为 `disabledModules`，值不变（模块 id 和原来的功能 id 相同）。加 `"v": 2` 标明格式版本。

分三步：

1. **扩展（代码，随第一个版本上线）**
   - `parseProfile` 两个字段都认。有 `disabledModules` 就用它，否则用 `disabledTools`。
   - 保存时两个字段都写，值相同，并写上 `"v": 2`。
   - 结果：没升级的数据库照常工作；新代码写出的数据旧代码也能读，旧代码只认 `disabledTools`，它还在。
2. **迁移（schema v4，管理员点“升级到 v4”）**

   ```sql
   update gateway.chat_profiles
     set profile = profile
       || jsonb_build_object('disabledModules', profile -> 'disabledTools', 'v', 2),
         updated_at = now()
     where profile ? 'disabledTools' and not profile ? 'disabledModules';
   ```

   这条可以重复执行，不会改已迁移的行，也保留 `disabledTools`。
3. **收缩（schema v5，至少在 v4 稳定运行一周后，单独一次发布）**
   - 代码不再读写 `disabledTools`。
   - 执行 `update gateway.chat_profiles set profile = profile - 'disabledTools' where profile ? 'disabledModules';`
   - 这一步之后不能回滚到第 1 步之前的代码，发布说明里要写明。

`quota` 的 key 不变，不迁移。

### 9.4 每日用量（`gateway.usage_daily`）

计数名不变，不迁移。模块的 `meter.key` 必须是已有的计数名之一，由测试检查。用量统计从“工具 → 功能 → 计数”（`METERED` 表）改为“工具 → 模块 → `meter.key`”，同一个工具得到的计数名和以前完全一样。有一条测试用固定的历史事件分别跑新旧两种统计，结果必须一致。

### 9.5 事件日志（`gateway.events`）

- 事件格式不变，不迁移。
- 系统提示不存进日志，每次请求时现拼。所以提示词重构上线后，下一次请求就用新提示词，进行中的对话不受影响。旧的工具调用和结果仍然在历史里，工具名没变，模型能看懂。
- 唯一的影响：上线后每个聊天的第一次请求，提示词缓存不命中，花费短暂上升。以后恢复正常。
- 部署时如果正好有一轮跑到一半交给新函数（handoff），新函数用新提示词接着跑。这和平时改配置后的行为一样，没有额外风险。

### 9.6 有状态的能力切换实现时（以后才会发生）

记忆（Upstash 里的向量）和沙盒（每个聊天的 Vercel Drive 工作区）的数据存在实现自己那边，换实现会“看不到”旧数据。设计上先把流程定好，第一版因为只有一个实现，所以不会触发：

1. 管理端在有状态能力的设置页切换实现时，不直接保存，先弹出确认。确认里说明旧实现有多少数据（实现能报告时）。
2. 两边都实现了 `exportData` / `importData` 的话，提供“迁移数据后切换”。迁移在后台分批做，每批记进操作记录，可以断点续传（按 id 幂等写入）。迁移完成并核对数量一致后，才写入新的选择配置。
3. 不支持迁移的话，只提供“放弃旧数据并切换”，要求输入能力名二次确认。旧实现的数据不删除，切回去还能看到。

### 9.7 管理端

- 设置页“能用的工具”改成“能用的模块”，读写 `disabledModules`（第 1 步期间两个字段都写）。
- 地址 `#/config/<分组>` 的分组 id 如有调整，旧地址重定向。
- 操作记录里的历史条目（`detail` 里可能有 `disabledTools`）原样显示，不改写历史。

### 9.8 上线与回滚手册

| 步骤 | 做什么 | 怎么确认 | 回滚 |
|---|---|---|---|
| 1 | 部署第一阶段代码（第 11 节 P1–P5） | 管理端模块页：原来启用的功能都“已就绪”；挑一个群打开提示词预览，对照第 10 节的对比报告 | Vercel 回滚到上一个部署，数据无需处理 |
| 2 | 管理端点“升级到 v4” | `select count(*) from gateway.chat_profiles where profile ? 'disabledTools' and not profile ? 'disabledModules'` 为 0 | 旧代码仍读 `disabledTools`，可直接回滚代码 |
| 3 | 观察至少一周 | 用量、额度、各群开关与升级前一致 | 同上 |
| 4 | 部署收缩版本并升级到 v5 | 同 2，且 `disabledTools` 已不存在 | 只能回滚到步骤 1 之后的版本 |

## 10. 怎么验证

**组装前后对比**

- 重构前，先把现在每种组合（私聊、群聊 × QQ、Telegram × 全部功能开或分别关一个）拼出的完整提示词和工具定义，存成测试夹具（P0）。
- 重构后再生成一份，自动出一份对比报告：哪些句子原样保留、移到了哪个段落、哪些被改写或删掉。
- 被改写或删掉的每一句，都要在报告里有人工确认的理由。主要是人设里去掉工具名的那几句。

**新增测试**

- 人设、规则、场景段不出现任何已注册的工具名。
- 关掉一个模块：它的工具和段落都不出现，也没有别的段落提到它的工具。
- 依赖缺失（沙盒没配置）：画图模块整体不生效，原因写明依赖。
- 能力选择：覆盖 6.2 表里的每一行。
- 同一聊天连续两次组装逐字相同；每个模块单独开关时，其他段落的文字不变。
- 有未替换的变量时 `assemble()` 抛错。
- 每个 `meter.key` 是已有计数名；用固定历史事件跑新旧用量统计，结果相同。
- `parseProfile`：只有 `disabledTools`、只有 `disabledModules`、两者都有、都没有，这四种情况的结果都正确；保存时两个字段都写。
- schema v4 的迁移 SQL 执行两次结果相同。放在 `npm run test:store` 里，设置了 `TEST_DATABASE_URL` 时会在一个真实的、可以随便清空的 Postgres 上执行 `schema.sql`。
- 实现目录下的 `settings.ts` 没有任何 import。

现有 86 个测试改为按新路径导入，断言不变。

## 11. 分阶段实施

每个阶段一次提交，单独能通过全部测试、单独能部署：

| 阶段 | 内容 | 数据 |
|---|---|---|
| P0 | 把现在的提示词和工具定义存成测试夹具 | — |
| P1 | 段落注册表和 `assemble()`；`SYSTEM_PROMPT` 拆成 persona / rules / 各模块段落；runner、compaction 改用 `assemble()` | — |
| P2 | 模块清单取代 `registry.ts`、`ToolFeature`、`METERED`、`PROFILE_CHOICES.features`、setup 里的功能表；工具搬进各模块目录 | — |
| P3 | 能力和实现：五种能力各包一个实现；配置项定义按实现拆分；新增五个 `*_PROVIDER` 配置项；语音的 dialect 拆分 | 只新增配置项定义，不写数据 |
| P4 | `disabledModules` 扩展阶段（9.3 第 1 步）+ schema v4 迁移 SQL | v4 |
| P5 | 管理端：模块页、配置页的实现选择、聊天设置的“能用的模块”和系统提示预览、引导页读模块状态 | — |
| P6 | 文档：更新 `docs/tools.md`、`docs/agent.md`、`docs/admin.md`、`docs/configuration.md`；新写 `docs/modules.md`（怎么新增一个模块或实现） | — |
| P7 | 收缩（9.3 第 3 步）+ schema v5，单独一次发布 | v5 |

P1–P6 可以一起上线，P7 至少隔一周。

## 12. 以后可以接着做的

- **渠道套进同一体系。** 渠道是“可以同时启用多个”的一类模块：它贡献 `channel` 段落和入口，不贡献工具。到时给 `Capability` 加一个 `multiple: true` 即可，不影响本设计。
- **新增实现。** 搜索加 Exa / Tavily；记忆加 Supabase pgvector（顺带不再依赖 Upstash）；沙盒加 E2B。
- **管理端编辑段落。** 设计已经允许按段落名覆盖（像 dsh 的作用域覆盖）：全局改人设，或者单个群覆盖某一段。需要时加存储和编辑界面即可。
- **`{{bot_name}}` 做成配置项**，让人设可以换名字。

## 13. 待定问题

1. `get_search_balance` 是 DeepSeek 特有的。本设计让它只在实现支持 `balance()` 时出现；另一种做法是把它和 `get_llm_key_limit` 合并成一个查余额工具。合并要改工具名，按 9.1 需要别名。倾向不合并。
2. 第一版是否就在管理端提供人设编辑（存在 `gateway.settings` 的一个长文本配置项里）？本设计倾向先只做预览。
3. P7 收缩前要观察多久：一周够不够？

## 实施记录（2026-11-09）

| 阶段 | 提交 | 说明 |
|---|---|---|
| P0 | e6997d6 | 夹具在 `scripts/fixtures/prompt-v1/` |
| P1–P4 | b36b1c1 | 互相咬合，合成一次提交；schema v4 在真实 Postgres 上测过（执行两次结果相同） |
| P5 | e201412 | 管理端 |
| P6 | 本次 | 文档 |
| P7 | 见下 | 收缩提前做了：评审要求删掉全部兼容代码 |

和上面设计不一样的地方：

1. **余额归各自的模块**（评审时提出，替代第 13 节问题 1）。新增核心模块“模型”，`get_llm_key_limit` 只报模型 key；画图 key 拆成画图模块的新工具 `get_image_key_limit`（和模型共用 key 时直接说明）；`get_search_balance` 只在搜索实现能查余额时提供。模块统一声明 `balance()`，总览逐个模块列余额。
2. **示例的位置**：5.3 说只用发消息和表情包的示例留在 `rules`，但这和“规则里不出现工具名”冲突。改为放进“聊天”模块的段落（核心模块，始终在场）。
3. **dialect 放在语音能力的接口上**，而不是通用的 `Provider`：`SpeechBackend.dialect()` 返回工具描述用的一段、提示词段落用的一行，以及是否支持行内标签（决定示例怎么写）。其他能力的接口没有这一项，所以“只有语音能影响提示词”由类型保证。
4. **`meter` 列出计量的工具**（`tools`）：画图、搜索模块里多了余额工具，按模块整体计量会把查余额也算成一次画图或搜索。
5. **每个模块一个 `section`**，不是数组；目前没有模块需要多段。
6. **实现的配置分组带 `essentials`**：引导页只问开启需要的几项。
7. **管理端新增“模块”页**，并把聊天设置里的系统提示预览做成按段落标注来源。
8. **9.6 的数据迁移**只定了流程，没有实现 `exportData` / `importData`：每种有状态能力目前只有一个实现，切换不会发生。配置页会提示换实现会看不到旧数据。
9. **提示词对比**：`scripts/prompt-report.ts` 把旧提示里每一行和新提示对比，原样保留的之外，每一行改动都要在脚本里写明原因，否则失败。结果见 [`prompt-migration-report.md`](prompt-migration-report.md)：六种组合合计原样保留 244 行，改写或移走 264 行，全部审阅过。改动主要是三类：人设和规则里去掉工具名，工具用法搬进各自模块，示例跟着模块走。

### 收缩（P7，提前完成）

评审要求删掉全部迁移和兼容代码，所以没有等一周观察期，并做了这些调整：

- **schema v5 一步完成迁移**：把 `disabledTools` 搬到 `disabledModules`（v4 已复制过的就直接删旧字段），同时删掉 `"v": 2` 标记。语句可以重复执行，不管数据库之前有没有升级到 v4 都适用。代码只读写 `disabledModules`。
  - 代价：部署后到管理员点“升级到 v5”之前，还没迁移的聊天里关掉的模块会暂时恢复开启；升级后恢复。也不能再退回 v4 之前的代码而保留开关。
  - 线上升级到 v5 之后（2026-11-09），这条迁移语句也从 `schema.sql` 里删了；表结构版本仍是 v5。
- **删掉模型配置的旧变量名**（`OPENROUTER_*` 回退和 `/api/health` 的 `legacyEnv`）：线上已经不用。
- **删掉聊天记录对旧日志的补全**（`bot/sent` 出现之前，用发消息工具的调用补出机器人说的话），以及只为它存在的 `Tool.historyLine`。早于 2026-11-06 的日志里，机器人说的话不再显示在管理端的聊天记录里；这些日志会随压缩和 7 天过期自然消失。
- **删掉 schema.sql 里 v2→v3 的清理语句**、没用上的 `aliases`、管理端 `#/config/tts` 的旧地址跳转、一次性的提示词对比脚本和夹具。

### 模块契约第二版（2026-11-09）

评审发现第一版还有耦合和写死的地方，参照 dsh 的插件契约（`name` / `inject` / `Config` / `apply`，组合清单 `cordis.yml`）重新定了模块的定义，见 [`docs/modules.md`](../modules.md#模块怎么定义参照-deepseek-harness-的插件)：

- **新增模块从改五处变成改两处**：模块目录，加上 `src/modules/index.ts` 里一行。配置（`config`）、提示词位置（`section.order`，在 `ORDER.modules` 范围内）都由模块自己声明；`ModuleId`、`MeterKey` 两个写死的联合类型删了；开关配置项由配置目录自动生成；模块定义在加载时检查（重复、越界、依赖不存在都直接报错）。
- **人设集中到 `src/persona/`**：名字、给图像模型的长相、形象图、声音、表情包、示例都在这里，模块里不再出现（测试保证）。示例从模块段落里移到人设，按模块过滤；语音音色名从 `dafeiyu` 改为 `self`。
- **模块之间只引用对方的 `index.ts`，并且要在 `requires` 里声明**（测试保证）。发消息共用的 `reply_to` / `quote` 参数移到 `modules/shared`；沙盒通过 `index.ts` 导出工作区接口。
- **“模型”成为完整的模块**：它的配置从核心配置移过来，“测试”变成它的 `check`，引导页里它这一步由 `setup: "required"` 生成，不再写死分组名和专门的接口。表情包地址也归“聊天”模块。
- **加载顺序**：配置目录收集模块的配置后，模块、配置目录和 `config.ts` 互相引用。模块定义改成函数（加载器在所有文件加载完后调用，相当于 dsh 的 `apply`），实现列表改成 getter，`npm run test:load` 逐个文件验证。

