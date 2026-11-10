# 模型价目表

网关按这张表给模型调用和画图调用计价：服务在响应里只报 token、不报金额时，core 用模型名按正则找到条目，按 token 数乘单价补全花费（`packages/core/src/pricing/`）。每个聊天的花费额度、模型和画图的[花费上限](../../docs/configuration.md#花费上限)都按它算。

价目表由 `scripts/pricing/` 里的脚本从上游价目生成，GitHub Actions 每天同步一次（见下文“更新”）。

| 文件 | 说明 |
|---|---|
| `model-prices.json` | 价目表，由构建脚本生成，不要手改。部署时随函数一起打包（`packages/vercel/vercel.json` 的 `includeFiles`） |
| `curated.json` | 自行维护的条目：上游价目表没有收录或口径不同的模型，以及按次、按张、按秒计价的项目 |
| `THIRD_PARTY_NOTICES.md` | 上游数据的版权和许可声明 |

## 价格口径

一律按模型厂商的官方价目：模型由谁发布，就以谁的官方 API 定价为准。DeepSeek 按 DeepSeek，千问按阿里云百炼，Claude 按 Anthropic。经第三方渠道（如 OpenRouter）调用时，实际价格可能不同；OpenRouter 画图会在响应里报实际金额，这时用它报的金额，不查表。

- 按厂商公开的标准价，不含限时折扣、免费额度和 Batch 价。
- 已退役的型号保留最后的官方价，条目的 `note` 中写明。
- 按人民币计价的条目（DeepSeek、千问）按 `PRICE_CNY_PER_USD`（管理端“配置 → 计价”，默认 7.1）折成美元。

## 数据来源

计价时按文件顺序取第一个命中的条目。条目按以下来源依次排列，同一模型以排在前面的来源为准：

1. **`curated.json`**：DeepSeek（含高峰 / 空闲分时价）、阿里云百炼的千问系列（含上下文阶梯和思考模式价）、OpenAI 画图模型，以及按次计价的项目。
2. **[langfuse](https://github.com/langfuse/langfuse)** `worker/src/constants/default-model-prices.json`：OpenAI、Anthropic、Google。
3. **[litellm](https://github.com/BerriAI/litellm)** `model_prices_and_context_window.json`：xAI、Moonshot、MiniMax、智谱、Mistral，以及 OpenAI 在 langfuse 中未收录的型号。

`model-prices.json` 的 `sources` 字段记录了生成时所用的上游提交。

## 格式（schema_version 1）

```json
{
  "id": "deepseek-v4-flash",
  "match": "(?i)^(deepseek/)?deepseek-v4-flash$",
  "unit": "mtok",
  "currency": "CNY",
  "source": "价格出处",
  "examples": ["deepseek-v4-flash"],
  "tiers": [
    { "name": "空闲时段", "rates": { "input": 1.5, "output": 4.5, "cache_read": 0.05 } },
    { "name": "高峰时段", "priority": 10,
      "when": [{ "time_window": { "tz": "Asia/Shanghai", "hours": ["09:00-12:00", "14:00-18:00"], "weekdays": [1, 2, 3, 4, 5] } }],
      "rates": { "input": 3.0, "output": 9.0, "cache_read": 0.1 } }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `id` | 条目标识，`[a-z0-9._-]{1,32}`，文件内唯一 |
| `match` | Python 正则，在模型名的任意位置查找（`re.search`）；开头的 `(?i)` 表示不区分大小写。网关在 JavaScript 里编译同一个正则，`npm test` 检查每一条都能编译 |
| `unit` | `mtok`（每百万 token）、`request`、`image`、`credit`、`second`。网关只用 `mtok` 条目给模型和画图计价 |
| `currency` | `USD` 或 `CNY` |
| `examples` | 必须匹配到本条目的模型名，用于校验正则没有写得过宽 |
| `tiers` | 计价档位，见下文 |

**档位**：恰好一档不带 `when`，为默认档。条件档的 `when` 中所有条件同时成立才命中；命中多档时取 `priority` 最高的一档，作用于整次调用。条件档未写的费率取默认档的值。

**费率键**（每百万 token）：

| 键 | 计的是 |
|---|---|
| `input` | 没走缓存的输入 |
| `input_image` | 没走缓存的输入里的图像 token（不写时按 `input`） |
| `output` | 输出（含思维链） |
| `cache_read` | 缓存命中的输入（不写时按 `input`） |
| `cache_read_image` | 缓存命中的图像 token |
| `cache_write_5m` / `cache_write_1h` | 写入缓存的输入 |

非 token 条目只有 `per_unit`。费率全为 0 的档必须填写 `zero_reason`。

**条件**：

| 条件 | 写法 | 含义 |
|---|---|---|
| `input_tokens` | `{"gt": N}` 或 `{"gte": N}` | 本次调用的全部输入 token（含缓存读写） |
| `time_window` | `{"tz": "Asia/Shanghai", "hours": ["HH:MM-HH:MM"], "weekdays": [1, 2, 3, 4, 5]}` | 调用开始时间落在时段内；时段可跨零点，`weekdays` 可省略 |
| `service_tier` | `{"in": ["priority"]}` | 服务档位 |
| `reasoning` | `{"used": true}` | 本次调用产生了思考 token |

## 更新

GitHub Actions（`.github/workflows/sync-pricing.yml`）每天北京时间 14:30 运行：拉取上游最新价目，与 `curated.json` 合并并校验；价目有变化时开（或更新）一个 PR，正文列出新增、删除和改价的条目。核对后合并，合并到 `main` 会触发部署，新价格只影响之后的调用。修改 `curated.json` 或构建脚本并推送到 `main` 时也会触发。

这个任务要在仓库的 **Settings → Actions → General** 里打开 “Allow GitHub Actions to create and approve pull requests” 才能开 PR。

本地构建与测试只需 Python 3.12 标准库：

```bash
python3 scripts/pricing/build_pricing.py
python3 scripts/pricing/validate_pricing.py resources/pricing/model-prices.json
python3 -m unittest discover -s scripts/pricing/tests
```

构建脚本会调用 GitHub API 查询上游提交，设置 `GH_TOKEN` 或 `GITHUB_TOKEN` 可避免匿名访问限流。

## 许可

价目数据有很大一部分来自以下开源项目：

- [langfuse/langfuse](https://github.com/langfuse/langfuse)，MIT 许可，Copyright (c) 2023-2026 ClickHouse, Inc.
- [BerriAI/litellm](https://github.com/BerriAI/litellm)，MIT 许可，Copyright (c) 2023 Berri AI

原版权与许可声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
