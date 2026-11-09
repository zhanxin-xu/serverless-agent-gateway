# 架构

## 三个包

npm workspaces，依赖方向 core ← adapters ← vercel。

| 包 | 内容 | 能依赖 | 对外 |
|---|---|---|---|
| `@gateway/core`（`packages/core/`） | 运行时、agent loop、事件流、提示词、配置、聊天设置、管理端、模块契约和 8 个内置模块、存储和渠道的接口 | 只有自己 | `src/index.ts` |
| `@gateway/adapters`（`packages/adapters/`） | 第三方服务的实现：一家厂商一个目录，里面按实现的接口分（`deepseek/search/`、`openrouter/image/`、`supabase/store/`…），渠道一家一个（`qq/`、`telegram/`、`http/`） | `@gateway/core` | 每家厂商的 `index.ts`：`@gateway/adapters/<厂商>` |
| `@gateway/vercel`（`packages/vercel/`） | 部署包：组合、Vercel 宿主、`/api/worker`、人设、`assets/`、`api/`、`vercel.json` | 上面两个包的公开入口 | 无 |

`scripts/moduletest.ts` 检查：
- core 不引用任何 `@gateway/*`，不用 `@vercel/functions`；
- 一家厂商的目录不引用另一家的；
- 跨包只走公开入口；
- 人设只是数据；
- `api/` 只转给 `src/index.ts`；
- 每个文件用到的 npm 包都写在自己包的 `package.json` 里。

## 组合

部署调用一次 `compose()`（`packages/core/src/composition.ts`），把下面这些交给核心。核心不出现任何具体的厂商、渠道、存储、宿主或人设，只从组合里读。组合里的东西都在 `compose()` 之后才读，文件加载的先后无所谓。

| 字段 | 是什么 | Vercel 部署包 |
|---|---|---|
| `baseDir` | 部署包的目录，配置里写的文件路径（形象图、参考音频）相对它 | `packages/vercel/` |
| `host` | 后台任务、一次运行的时长、跑不完时怎么接力、CDN 缓存头 | `waitUntil`、`maxDuration`、把运行锁交给 `/api/worker` |
| `persona` | 人设 | 大肥鱼 |
| `modules` | 加载哪些模块，按什么顺序 | 全部 8 个 |
| `providers` | 各能力的实现 | DeepSeek、Upstash Vector、Vercel Sandbox、OpenRouter 画图、OpenAI 兼容语音 |
| `modelAccount` | 怎么查聊天模型 key 的余额；没有就没有 `get_llm_key_limit` | OpenRouter `/key` |
| `channels` | 渠道 | QQ、Telegram、HTTP |
| `store` / `database` | 存储，以及管理端怎么给它建表 | 配了 Supabase 用 Supabase，否则内存 |
| `guide` | 管理端里随部署变的文案：怎么设管理密码、怎么连数据库 | Vercel 控制台的步骤 |

`compose()` 拒绝不属于任何已加载模块的实现，以及同一能力下重复的实现 id。

管理端跟着组合走：配置页列出组合里的模块、实现和渠道的配置项；引导页的密码和数据库步骤来自 `guide`，数据库状态来自 `database`，标题和头像来自人设。

## 构建

每个包的 `exports` 有三个条件：

| 条件 | 指向 | 谁用 |
|---|---|---|
| `source` | `src/*.ts` | 开发、测试（`tsx --conditions=source`）、类型检查（`customConditions`），不用先构建 |
| `types` | `dist/*.d.ts` | 不带 `source` 条件的类型检查 |
| `default` | `dist/*.js` | Vercel |

`npm run build` 用 `tsc` 把 core 和 adapters 编译到各自的 `dist/`，并拷贝管理端页面和 `schema.sql`。Vercel 上这一步写在 `packages/vercel/vercel.json` 的 `functions["api/**/*.ts"].installCommand` 里：只有 `api/` 函数、没有框架的项目，Vercel 不认顶层的 `installCommand`。部署包自己的 TypeScript 由 Vercel 编译。

## 文件

不按进程的当前目录找文件：
- 管理端页面和 `schema.sql` 按所在包的位置找（`import.meta.url`）；
- 人设的形象图、参考音频这类“部署里的文件”相对 `baseDir`。

`silk.wasm` 不会被 Vercel 自动打包，写在 `vercel.json` 的 `includeFiles` 里。

## 新增一种部署

新建一个包 `packages/<名字>/`，依赖 `@gateway/core` 和 `@gateway/adapters`，写三样东西：
1. 一个 `Host`；
2. 一个组合；
3. 把请求转给 core 的处理函数（`handleWebhook`、`handleAdmin`、`healthReport`），宿主能接力的话再加一个接手运行的入口（参考 `packages/vercel/src/worker.ts`）。
