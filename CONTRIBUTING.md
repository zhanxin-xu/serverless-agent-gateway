# 贡献指南

感谢你愿意参与改进 serverless-agent-gateway！

## 提 Issue

- **Bug**：说明你用的渠道、复现步骤、期望结果和实际结果。Vercel 日志里 `[webhook]`、`[ingress]`、`[runner]`、`[turn]`、`[agent]` 开头的几行最有帮助，贴出来之前请去掉 Token、AppSecret 等敏感信息。
- **功能建议**：说明使用场景，以及现有功能为什么满足不了。
- **安全问题**：不要公开提 Issue，请按[安全策略](SECURITY.md)私下报告。

## 开发环境

需要 Node.js 24。

```bash
npm install
cp .env.example .env.local   # 只填你要调试的部分
npm run dev                  # 本地跑 Vercel 部署包：http://localhost:3000/admin
```

不需要任何真实凭据也能跑测试：

```bash
npm test             # 离线端到端测试，所有外部接口都已经 mock
npm run test:store   # 存储契约测试
npm run typecheck
```

改了 `packages/adapters/src/supabase/schema.sql` 或存储层时，请用一个可以随便清空的本地 Postgres 跑一遍真实的 SQL（测试会重建其中的 `gateway` schema）：

```bash
createdb gateway_test
TEST_DATABASE_URL=postgresql:///gateway_test npm run test:store
TEST_DATABASE_URL=postgresql:///gateway_test npm test
```

`npm test` 会替换掉全局的 `fetch`，模拟模型、QQ、Telegram、DeepSeek、Supabase、Upstash Vector 等所有外部服务，然后走一遍真实的 Webhook 处理和 agent loop。沙盒相关的测试使用内存里的假工作区；要在真实的 Vercel Sandbox 上验证，见[工具文档](docs/tools.md#沙盒工作区)。

## 提交代码

1. Fork 仓库并新建分支。
2. 修改代码，**同时在 `scripts/selftest.ts`（存储相关的在 `scripts/storetest.ts`）里补上或更新测试**。
3. 确认 `npm run typecheck`、`npm run build`、`npm test` 和 `npm run test:store` 都通过。CI 会在每个 Pull Request 上自动运行，并且带一个真实的 Postgres。
4. 改了行为或配置的话，同步更新 `docs/`、`README.md` 和 `.env.example`。
5. 提交 Pull Request，说明改了什么、为什么改。

## 代码约定

- **和周围的代码保持一致**：命名、注释密度、写法都参照同一文件里已有的代码。
- **守住包的边界**：core 不引用其他包；跨包只走公开入口（`@gateway/core`、`@gateway/adapters/<厂商>`）；用到的 npm 包写进所在包的 `package.json`。测试会检查，见[架构](docs/architecture.md)。
- **外部接口直接用 `fetch`**：模型、QQ、Telegram、Supabase、Upstash Vector 都是直接调用 HTTP 接口，不引入 SDK，方便透传参数，也让测试能统一 mock。例外：Vercel Sandbox 用 SDK 处理认证，Supabase 建表用 `pg` 直连。
- **配置项跟着它的主人**：核心配置（Agent、管理）在 `packages/core/src/settings/catalog.ts`；模块、实现、渠道的配置在各自目录的 `settings.ts`，配置目录从组合里自动收集。读取用 getter 实时读，取值顺序是管理端 → 环境变量 → 默认值。新增配置写进 `docs/configuration.md` 和 `.env.example`。
- **加载时不读别的文件的导出值**：模块、配置目录和 `config.ts` 互相引用，模块定义是函数、实现列表是 getter。改了模块结构后跑一下 `npm run test:load`。
- **注释解释"为什么"**：平台限制、踩过的坑、看起来奇怪但必须这样写的地方，都值得写一句注释。
- **不要提交密钥**：`.env*` 已经在 `.gitignore` 里。仓库是公开的，提交前请检查一遍 diff。

## 常见改动

- **改人设**：编辑 `packages/vercel/src/personas/dafeiyu/`（换一个人设：新建 `packages/vercel/src/personas/<名字>/`，在部署的组合里换掉）。人设里不要写工具名，工具怎么用写在它所在模块的说明里；模块里也不要写人设（测试都会检查）。
- **新增工具、模块，或给一种能力加一家服务**：见[模块](docs/modules.md)。
- **新增渠道**：见[渠道接入](docs/channels.md#新增渠道)。

## 许可证

提交的代码将以 [MIT 许可证](LICENSE) 发布。
