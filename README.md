# opencode Trae Bridge

将企业版 **Trae CLI** 封装为本地 OpenAI 兼容的 HTTP 服务，并作为自定义 provider 接入 [opencode](https://opencode.ai)，让 Trae 模型在 opencode TUI 中像原生模型一样使用。

- 零第三方依赖，仅使用 Node 内置模块。
- 流式响应中 Agent 的思考过程与内部工具调用实时进入 opencode 思考块，最终答案作为正文一次性输出，时序清晰、正文干净（中间叙述与最终答案共用同一条流、无法可靠区分，故一并抑制以避免重复）。
- 单一配置源 `config/config.mjs`（可执行）同时驱动转接层与 opencode provider；模型列表在安装时实时从 `traecli models` 获取。
- 提供幂等、带备份、可回滚的安装/卸载/状态脚本。

## 工作原理

```
opencode ──OpenAI 协议──▶ 转接层 server.js ──spawn──▶ traecli（无头模式）
   ▲                          （127.0.0.1:8790）
   └── 生命周期插件在 opencode 启动时拉起转接层、退出时关闭
```

- opencode 通过 `provider.trae`（`@ai-sdk/openai-compatible`）以 OpenAI 协议访问本地转接层。
- 转接层将请求转成 `traecli -p --output-format stream-json` 调用，把 NDJSON 输出翻译成 OpenAI 流式（SSE）或非流式响应。
- 转接层在将 opencode 消息转发给 traecli 前，自动剥离 opencode 附加的提示词内容（系统指令、工具定义、superpowers 引导、plan mode 提醒等），使 traecli 收到的 prompt 与用户直接在终端运行 traecli 时一致。对话历史原样保留。
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

1. 实时执行 `traecli models` 获取当前可用模型列表（获取失败则中止安装，不写入任何文件）
2. 复制 `src/server.js` → `~/.config/opencode/trae-bridge/server.js`
3. 由 `config/config.mjs` 生成 `~/.config/opencode/trae-bridge/config.json`
4. 复制 `src/trae-bridge.js` → `~/.config/opencode/plugins/trae-bridge.js`
5. 写入 `~/.config/opencode/plugins/package.json`（`{"type":"module"}`），声明插件为 ESM；若已存在且 `type≠module` 则提示人工确认，不覆盖
6. **备份**现有 opencode 配置（带时间戳），再把 `provider.trae` 深合并进去

安装后：**完全退出并重启 opencode** → 运行 `/models` 确认出现 `trae/*` 模型 → 选中即可对话。

安装**不会**修改你既有的默认模型（不写 `model` 字段），避免劫持你的配置。你可以在 opencode TUI 中用 `/models` 自行选择。

> AI 代理可参考 [`install.md`](./install.md) 在不运行脚本的情况下完成安装。

## 卸载

```bash
node scripts/uninstall.mjs
```

会删除插件文件与 `~/.config/opencode/trae-bridge/` 目录，条件清理 `~/.config/opencode/plugins/package.json`（仅当其仅含 `{"type":"module"}` 且目录内无其它插件时才删除），并在**备份后**从 opencode 配置移除 `provider.trae`。完成后重启 opencode。

> AI 代理可参考 [`uninstall.md`](./uninstall.md) 在不运行脚本的情况下完成卸载。

## 状态检查

```bash
node scripts/status.mjs
```

报告插件、转接层、派生配置是否就位，`provider.trae` 是否已注册，并对 `GET /v1/models` 探活列出模型。

> 注意：转接层由 opencode 插件在启动时拉起，因此探活成功的前提是 opencode 正在运行。

## 配置：`config/config.mjs`

所有可调项集中在此可执行配置文件，改后重新运行 `node scripts/install.mjs` 生效。常量项直接定义，模型列表通过逻辑实时获取。

| 导出项 | 类型 | 说明 |
| --- | --- | --- |
| `port` | 整数 | 转接层监听端口（默认 `8790`） |
| `host` | 字符串 | 监听地址（默认 `127.0.0.1`，仅回环） |
| `traecliPath` | 字符串 | traecli 可执行文件的显式路径。**通常留空**（`""`）即可，会自动探测；仅在非标准安装位置时才需填写 |
| `defaultPermissionMode` | 字符串 | 无 plan 信号时的默认值：`bypass_permissions`（可改文件，默认）或 `plan`（只读）。opencode 的 build 模式不注入任何标记，故默认放行；仅当检测到 plan 信号时才只读 |
| `maxPromptChars` | 整数 | prompt 作为命令行参数的字符上限（默认 `30000`） |
| `resolveModels()` | 函数 | 安装时执行 `traecli models`，实时返回模型列表 `[{ id, name }]`；`id` 传给 traecli，`name` 为 opencode 中的显示名（`"<id> (Trae)"`） |

### 环境变量

转接层支持以下环境变量，优先级高于 `config/config.mjs` 中的对应字段：

| 变量名 | 对应配置 | 说明 | 默认值 |
| --- | --- | --- | --- |
| `TRAE_BRIDGE_PORT` | `port` | 覆盖转接层监听端口 | `8790` |
| `TRAECLI_PATH` | `traecliPath` | 覆盖 traecli 可执行文件路径 | 自动探测 |
| `TRAE_BRIDGE_IDLE_TIMEOUT_MS` | — | 空闲超时阈值（毫秒）：traecli stdout 连续静默超过该值则判定卡死并终止 | `600000`（10 分钟） |

> 模型列表不再硬编码：每次安装都会实时从 `traecli models` 获取，自动跟随 Trae 平台的模型更新。若 `traecli models` 执行失败（未登录、找不到 traecli 或输出为空），安装会中止并给出清晰错误，此时请先确认 traecli 已安装并已登录。

### traecli 路径解析

安装脚本与转接层按以下优先级定位 traecli，**无需硬编码任何机器专属的绝对路径**：

1. 环境变量 `TRAECLI_PATH`（若设置且文件存在）
2. `config/config.mjs` 的 `traecliPath`（若非空且文件存在）
3. 自动探测各平台常见安装位置：
   - Windows：`%LOCALAPPDATA%\trae-cli\bin\`、`%APPDATA%\trae-cli\bin\`、`~\.trae-cli\bin\`
   - macOS / Linux：`~/.local/bin`、`~/.trae-cli/bin`、`/usr/local/bin`、`/opt/homebrew/bin`、`/usr/bin`
4. 以上都未命中时，回退到 `PATH` 上的 `traecli` 命令，交由系统解析

因此分发给他人时一般无需改动，只要对方已正常安装并登录 traecli 即可。

## 已知限制

- **JSONC 注释会丢失**：opencode 配置若为 `.jsonc` 且含注释，安装/卸载写回时会转成标准 JSON，注释与尾逗号将丢失。每次改动前都会生成带时间戳的备份（`opencode.jsonc.bak-<时间戳>`），可据此手工恢复注释。
- **prompt 长度受限**：prompt 通过命令行参数传入，超过 `maxPromptChars` 会截断（保留最近轮次），属有损。
- **无状态**：每次请求新起一个 traecli 进程，多轮对话靠把历史拼进 prompt，非真正会话复用。
- **权限模式靠信号推导**：转接层精确匹配 opencode plan 模式注入的 `Plan mode is active` 提示来判定只读；无此信号即视为 build（可改文件）。若未来 opencode 更改该提示措辞，需同步更新匹配逻辑。
- **孤儿进程**：正常情况下，客户端断开、请求异常或完成时都会终止 traecli 子进程；另有空闲超时保护——若 traecli stdout 持续静默超过 10 分钟（默认，可用 `TRAE_BRIDGE_IDLE_TIMEOUT_MS` 覆盖）则判定卡死并终止。仅当 opencode 异常崩溃时，转接层进程才可能残留占用端口——下次启动会探活确认占用者是否为自身实例，是则复用退出，否则报错退出。
