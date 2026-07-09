# opencode Trae Bridge

将企业版 **Trae CLI** 封装为本地 OpenAI 兼容的 HTTP 服务，并作为自定义 provider 接入 [opencode](https://opencode.ai)，让 Trae 模型在 opencode TUI 中像原生模型一样使用。

- 零第三方依赖，仅使用 Node 内置模块。
- 单一配置源 `config/trae.json` 同时驱动转接层与 opencode provider。
- 提供幂等、带备份、可回滚的安装/卸载/状态脚本。

## 工作原理

```
opencode ──OpenAI 协议──▶ 转接层 server.js ──spawn──▶ traecli（无头模式）
   ▲                          （127.0.0.1:8790）
   └── 生命周期插件在 opencode 启动时拉起转接层、退出时关闭
```

- opencode 通过 `provider.trae`（`@ai-sdk/openai-compatible`）以 OpenAI 协议访问本地转接层。
- 转接层将请求转成 `traecli -p --output-format stream-json` 调用，把 NDJSON 输出翻译成 OpenAI 流式（SSE）或非流式响应。
- 生命周期插件（`~/.config/opencode/plugins/trae-bridge.js`）负责在 opencode 启动/退出时管理转接层进程；其所有输出写日志文件，不污染 TUI。

## 前置条件

- 已安装 [Node.js](https://nodejs.org)（>= 18）。
- 已安装并登录企业版 Trae CLI（`traecli`）。**路径无需手工配置**：转接层会自动探测常见安装位置，或从 `PATH` 解析（详见下文「traecli 路径解析」）。
- 已安装 opencode。

## 安装

```bash
git clone <本仓库地址>
cd opencode-traecli
node scripts/install.mjs
```

安装脚本会：

1. 复制 `src/server.js` → `~/.config/opencode/trae-bridge/server.js`
2. 由 `config/trae.json` 生成 `~/.config/opencode/trae-bridge/config.json`
3. 复制 `src/trae-bridge.js` → `~/.config/opencode/plugins/trae-bridge.js`
4. **备份**现有 opencode 配置（带时间戳），再把 `provider.trae` 深合并进去

安装后：**完全退出并重启 opencode** → 运行 `/models` 确认出现 `trae/*` 模型 → 选中即可对话。

安装**不会**修改你既有的默认模型（不写 `model` 字段），避免劫持你的配置。你可以在 opencode TUI 中用 `/models` 自行选择。

## 卸载

```bash
node scripts/uninstall.mjs
```

会删除插件文件与 `~/.config/opencode/trae-bridge/` 目录，并在**备份后**从 opencode 配置移除 `provider.trae`（若默认模型残留为 `trae/*` 也一并清理）。完成后重启 opencode。

## 状态检查

```bash
node scripts/status.mjs
```

报告插件、转接层、派生配置是否就位，`provider.trae` 是否已注册，并对 `GET /v1/models` 探活列出模型。

> 注意：转接层由 opencode 插件在启动时拉起，因此探活成功的前提是 opencode 正在运行。

## 配置：`config/trae.json`

所有可调项集中在此文件，改后重新运行 `node scripts/install.mjs` 生效。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `port` | 整数 | 转接层监听端口（默认 `8790`） |
| `host` | 字符串 | 监听地址（默认 `127.0.0.1`，仅回环） |
| `traecliPath` | 字符串 | traecli 可执行文件的显式路径。**通常留空**（`""`）即可，转接层会自动探测；仅在非标准安装位置时才需填写 |
| `defaultPermissionMode` | 字符串 | 权限信号不明确时的默认值：`plan`（只读）或 `bypass_permissions`（可改文件） |
| `maxPromptChars` | 整数 | prompt 作为命令行参数的字符上限（默认 `30000`） |
| `models` | 数组 | 暴露给 opencode 的模型，每项 `{ "id": "...", "name": "..." }`；`id` 传给 traecli，`name` 为 opencode 中的显示名 |

### traecli 路径解析

转接层按以下优先级定位 traecli，**无需硬编码任何机器专属的绝对路径**：

1. 环境变量 `TRAECLI_PATH`（若设置且文件存在）
2. `config/trae.json` 的 `traecliPath`（若非空且文件存在）
3. 自动探测各平台常见安装位置：
   - Windows：`%LOCALAPPDATA%\trae-cli\bin\`、`%APPDATA%\trae-cli\bin\`、`~\.trae-cli\bin\`
   - macOS / Linux：`~/.local/bin`、`~/.trae-cli/bin`、`/usr/local/bin`、`/opt/homebrew/bin`、`/usr/bin`
4. 以上都未命中时，回退到 `PATH` 上的 `traecli` 命令，交由系统解析

因此分发给他人时一般无需改动，只要对方已正常安装 traecli 即可。

## 已知限制

- **JSONC 注释会丢失**：opencode 配置若为 `.jsonc` 且含注释，安装/卸载写回时会转成标准 JSON，注释与尾逗号将丢失。每次改动前都会生成带时间戳的备份（`opencode.jsonc.bak-<时间戳>`），可据此手工恢复注释。
- **prompt 长度受限**：prompt 通过命令行参数传入，超过 `maxPromptChars` 会截断（保留最近轮次），属有损。
- **无状态**：每次请求新起一个 traecli 进程，多轮对话靠把历史拼进 prompt，非真正会话复用。
- **权限模式靠关键词推导**：转接层通过文本匹配 plan/build 信号判断只读或可改文件，措辞变化可能误判。
- **孤儿进程**：正常情况下，客户端断开、请求异常或完成时都会终止 traecli 子进程，单次调用还有超时保护（默认 10 分钟，可用 `TRAE_BRIDGE_TIMEOUT_MS` 覆盖）。仅当 opencode 异常崩溃时，转接层进程才可能残留占用端口——下次启动会探活确认占用者是否为自身实例，是则复用退出，否则报错退出。
