# 记录：分层、拆包和清理（2026-11-09）

现行结构见 [`docs/architecture.md`](../architecture.md)。这里记的是为什么这样做、改了什么、出过什么问题。

## 分层与组合

评审问能不能拆成核心包、第三方适配包、部署包。第二版拆不开：能力直接引用自己的实现，核心引用人设，渠道和 Supabase 写在核心里，`waitUntil`、函数时限、`/api/worker` 接力、Vercel 的引导文案也在核心里。这一版先不拆包，只在一个仓库里把依赖方向理顺，以后拆包只是搬目录。见 [`docs/architecture.md`](../architecture.md)：

- **组合**（`src/composition.ts`）：部署调用一次 `compose()`，交给核心宿主（`Host`）、人设、模块、实现、渠道、存储（和建表的 `Database`）、模型余额（`ModelAccount`）和管理端文案（`ConsoleGuide`）。核心只从这里读，相当于 dsh 的 `cordis.yml`。模块清单 `src/modules/index.ts` 只导出模块定义，加载哪些由组合决定。
- **适配器**搬到 `src/adapters/<服务>/`：每个实现自带 `capability` 字段，能力的实现列表从组合里按能力 id 取；渠道带自己的配置项（`ChannelAdapter.config`），QQ 的 SILK 编码搬进 `adapters/qq`；Supabase 的连接配置、`PostgresStore` 和建表搬进 `adapters/supabase`。
- **人设**搬到 `src/personas/dafeiyu/`，导出一个 `Persona` 对象。用到人设的默认值（形象图、参考音频）、`send_sticker` 的表情清单、`{{bot_name}}`、管理端标题和头像都在组合之后读。人设没有表情包就没有 `send_sticker`。
- **宿主**：`webhook.ts` 和管理端的悄悄话用 `host().background`，运行的截止时间用 `host().runBudgetMs()`，只有宿主有 `handoff` 时一轮才会交给别处接着做。Vercel 的 `waitUntil`、`AGENT_MAX_DURATION_SECONDS` 和 `/api/worker` 都在 `deploy/vercel`。
- **接力不再用密钥**：原来 `/api/worker` 的请求用 `WORKER_SECRET`（不填时由模型 Key 和渠道密钥拼出来）签名。现在运行者交接时不放锁，把锁的持有者 ID 交给 worker，worker 凭它接过锁（`src/runtime/lock.ts` 的 `takeOver`：按这个持有者释放，成功一次就作废，再以新持有者抢锁）。只有持锁的运行知道这个 ID，所以它本身就证明请求来自自己；`WORKER_SECRET` 删掉了，接力和任何配置都无关。交接期间锁一直在运行者手里，别的消息的运行抢不到；只剩 worker 释放旧持有者、再以新持有者抢锁之间的一瞬，被抢先时由那边从事件流接着做。
- **两个部署**：`deploy/vercel`（`api/*.ts` 只转给它）和 `deploy/node`（常驻进程，`npm run dev` / `npm start`，没有接力，每次运行最长 `AGENT_RUN_BUDGET_SECONDS`）。原来的 `scripts/dev-server.ts` 是在本地模拟 Vercel，删了。
- **管理端跟着部署走**：没设密码时的步骤、换密码的说明、连数据库的步骤来自组合的 `guide`；数据库状态来自 `Database.status()`（不再写死 Supabase）；CDN 缓存头来自 `Host.cdnCache`。
- **测试**：`moduletest` 加了分层检查（核心只依赖核心，适配器只依赖核心和自己，人设只依赖类型，部署之间互不依赖，`api/` 只依赖 `deploy/vercel`，核心不用 `@vercel/functions`），人设名字的检查扩大到整个核心（包括提示词和管理端）。`loadtest` 覆盖 `src` 和 `deploy` 全部 143 个文件。

- **适配器目录按厂商分、厂商内按接口分**（`deepseek/search/`、`openrouter/image/`、`supabase/store/`…）：一家厂商常常服务几个模块（OpenRouter 管画图和模型余额），按厂商放共用代码才有地方；按模块找实现靠每个实现声明的 `capability`，`compose()` 拒绝不属于任何已加载模块的实现。部署只能从厂商的 `index.ts` 引用（测试检查）。

还没做的：本地部署收 QQ、Telegram 消息仍然要 webhook（需要公网地址或隧道）。要在没有公网地址的机器上用，需要渠道支持主动拉取（Telegram 的 `getUpdates`、QQ 的 WebSocket），那是给 `ChannelAdapter` 加一种收消息方式，和这次的解耦无关。

## 拆成三个包

按“核心一个、各种服务和渠道的实现一个、启动包按部署方式各一个”拆成 npm workspaces，仍在一个仓库里：

- **`@gateway/core`**（`packages/core/`）：原来 `src/` 里除了适配器和人设的全部。对外只有 `src/index.ts`：组合接口、配置读取、模块与能力接口、渠道和存储接口、给宿主用的处理函数（webhook、管理端、健康检查、运行与交接）。
- **`@gateway/adapters`**（`packages/adapters/`）：原来的 `src/adapters/`，服务和渠道合在一个包里（两者性质相同，现在只有一个部署，拆开只会多一份版本要维护）；目录按厂商、厂商内按接口分。对外是每家厂商的 `index.ts`（`@gateway/adapters/<厂商>`）。`schema.sql` 跟着 Supabase 适配器搬到 `src/supabase/`。
- **`@gateway/vercel`**（`packages/vercel/`）：宿主、worker、组合、人设、`assets/`、`api/`、`vercel.json`。Vercel 项目的 Root Directory 改成它。`deploy/node` 去掉了，换成这个包里的本地开发服务器 `scripts/dev.ts`；以后要常驻部署再加一个部署包。

为了能拆开，改了这些：

- **不再按当前目录找文件**：管理端页面按 core 自己的位置找（`src/admin/ui` 或构建后的 `dist/admin/ui`），`schema.sql` 按 adapters 自己的位置找；人设的形象图和声音这类“部署里的文件”相对组合新增的 `baseDir`（部署包的目录）。配置里存的路径还是 `assets/…`，线上已有的值不用改。
- **构建**：Vercel 自己编译 `api/` 和部署包里的 TypeScript，但不支持 project references，所以 core 和 adapters 先用 `tsc` 编译到 `dist/`（带类型声明）。包的 `exports` 有三个条件：`source`（源码，开发、测试和类型检查用 `--conditions=source` / `customConditions`，不用先构建）、`types`、`default`（`dist/`，Vercel 上用）。构建放在安装命令里（`cd ../.. && npm ci && npm run build`），因为设了 Build Command 而没有框架时，Vercel 会要求一个静态输出目录。安装命令必须写在 `functions` 条目里（见下面的事故记录）。
- **打包**：在本地用 `vercel build`（Root Directory 设为 `packages/vercel`）检查过每个函数带上了 core 和 adapters 的 `dist/`、管理端页面、`schema.sql`、`pg`、`@vercel/sandbox`、人设素材；`silk.wasm` 不会被自动追踪，`includeFiles` 里写成 `../../node_modules/silk-wasm/lib/silk.wasm`。
- **包之间的依赖写成 `file:../core`、`file:../adapters`**，不写 `*`：安装万一没走 workspaces，npm 也不会去公开仓库找同名的包。
- **测试**：分层测试改成按包检查：core 不引用任何 `@gateway/*`；adapters 只引用 `@gateway/core`，厂商之间不互相引用；vercel 只用两个包的公开入口；人设只是数据；每个文件用到的 npm 包必须写在自己包的 `package.json` 里。

### 事故（2026-11-09 19:17–19:24）

第一次推送拆包后线上全部 500。Vercel 对只有 `api/` 函数、没有框架的项目不认 `vercel.json` 顶层的 `installCommand`，只在包目录里跑了默认的 `npm install`，core 和 adapters 没有编译，函数加载 `@gateway/core` 时找不到 `dist/`。本地的 `vercel build` 没发现，是因为那份副本里还留着上一次构建的 `dist/`。处理：回滚到 `6633cb4` 的部署；安装命令移到 `functions["api/**/*.ts"].installCommand`；验证改成在没有 `node_modules`、没有 `dist/` 的干净副本里 `vercel build`，再把每个函数连同要上传的文件拷到源码目录之外单独运行。

## 清理

去掉了没人用的东西：`Host.config`（宿主自带配置项；删掉 `WORKER_SECRET` 后没有宿主再用它）、`Host.label`、`ConsoleGuide.label`、`/api/admin/status` 里的 `host`；core 公开入口里的 `processInbound`、`deploymentFile`（只在 core 内部用）；管理端 CSS 的 `.banner-info`、`.banner-warn`；文档里已删除的本地 Node 部署的 `AGENT_RUN_BUDGET_SECONDS`。只给测试用的 `runTool` 挪进测试脚本。`scripts/sandbox-smoke.ts` 从“分层与组合”那次起就没有组合网关，跑不起来，现在开头按 Vercel 部署组合一次。
