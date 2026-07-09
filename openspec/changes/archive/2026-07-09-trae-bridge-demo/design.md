## Context

企业版 Trae CLI 安装在 `%LOCALAPPDATA%\trae-cli\bin\traecli.exe`（别名 `trae-cli`、`trae-agent`、`ta`）。它使用环境变量 `TRAECLI_PERSONAL_ACCESS_TOKEN` 认证到 `https://zvalley-cn-ent.trae.volces.com`。它是一个完整的编码 Agent（自带 Read/Edit/Write/Bash 工具），不是裸模型 API。

opencode 是一个 Agent 引擎，它通过 provider 的 HTTP API 与“模型”通信；它不会调用命令行。要让 Trae 在 `/models` 里可选，就必须有东西呈现 OpenAI 兼容的 provider 表面。opencode 支持通过 `@ai-sdk/openai-compatible` 配置自定义 provider 并指定 `baseURL`，也支持在启动时运行的插件。

以下 Trae CLI 行为均已通过只读实测验证：

- 模型切换：`-c "model.name=<model>"` 可按次调用覆盖模型（配置默认值位于 `~/.trae/trae_cli.yaml` 的 `model.name`）。通过 `traecli models` 可查可用模型：`Doubao-Seed-Code`、`GLM-5.2`、`Kimi-K2.7-Code`、`DeepSeek-V4-Pro`、`DeepSeek-V4-Flash` 等。
- 无头输出：`-p --output-format json` 产生单个 JSON 对象，含 `message.content`（最终文本）和 `stats`。`-p --output-format stream-json --include-partial-messages` 产生 NDJSON：`type:"system"` 的 init/status 行、带 `delta.content` / `delta.reasoning_content` 的 `type:"stream_event"` 行、以及带最终 `result` 文本、`session_id` 和 `usage` 的 `type:"result"` 行。
- 登录/INFO 日志走 **stderr**；干净的 JSON 走 **stdout**。
- 权限模式：`--permission-mode plan` 阻止文件改动（Bash 工具返回 "Permission denied"）；`--permission-mode bypass_permissions`（或 `--yolo`）允许改动。
- prompt 输入：必须作为**命令行参数**。通过 **stdin 管道不生效**，且顶层命令**没有 `--file` 参数**。
- 内建斜杠命令（`/status`、`/help`）在 `-p` 模式下不会被执行；它们会被当作普通文本发给模型。

## Goals / Non-Goals

**Goals:**
- 跑通端到端：opencode TUI → 本地转接层 → traecli → 在 opencode 中显示流式回复。
- Trae 模型出现在 `/models` 的 `trae` provider 下且可切换。
- 流式（打字机）输出。
- 将 plan/build 翻译为 traecli 的 `--permission-mode`。
- 对话历史由 opencode 保留；额度几乎全部消耗在 Trae 上（而非 opencode 自己的模型）。
- 转接层由 opencode 插件自动托管。

**Non-Goals（demo 范围）：**
- 不做任何形式的命令映射（`/trae-*`）。
- 不做有状态的 Trae 会话复用（`--session-id`/`--resume`）；每轮都是无状态。
- 不在 opencode 的 diff/undo 中追踪 traecli 的文件编辑。
- 不处理 opencode 生成标题用的 `small_model`（保持 opencode 默认）。
- 不做打包/分发；仅在本地 `~/.config/opencode/` 下配置。

## Decisions

**1. 采用 provider-bridge 架构（本地 OpenAI 兼容 HTTP），而非 plugin-tool。**
opencode 只能通过 provider 触达 Agent。一个实现 `/v1/models` 和 `/v1/chat/completions` 的本地 HTTP 服务能让 Trae 表现为原生 provider，从而获得 `/models` 切换和原生对话体验，同时消耗 Trae 额度（这些轮次里 opencode 不运行自己的 LLM）。考虑过的替代方案：插件 `trae` 工具（方式一）——被否决，因为它同样消耗 opencode 模型额度，且无法在 `/models` 中呈现模型。

**2. 使用 Node 内置 `http` 模块，零第三方依赖。**
让 demo 用现有的 Node v24 就能轻松运行。转接层是单个 `trae-bridge/server.js`。替代方案：Express/框架——对两个端点来说过重。

**3. 每个请求 spawn 一次 traecli，只读 stdout。**
每个 `/v1/chat/completions` 都 spawn `traecli -p --output-format stream-json --include-partial-messages -c model.name=<model> --permission-mode <mode> "<prompt>"`。只解析 stdout；stderr 忽略/记录。与实测 I/O 行为一致。

**4. prompt = 将 messages 拼平为单个 CLI 参数。**
由于 stdin 与 `--file` 都不可用，`messages[]` 数组被拼成一个 prompt 字符串作为最后一个 CLI 参数传入。历史长度受操作系统命令行限制约束（Windows 上约 32K 字符）；超限时保留最近轮次。

**5. 通过请求负载判断 plan/build。**
将 opencode 的模式映射到 `--permission-mode`：plan → `plan`，build → `bypass_permissions`。判断读取对话请求中可用的信号（例如识别 opencode 注入的 plan 模式系统提示词）。这被认定为最脆弱的部分；不确定时默认使用 `plan`（安全/只读）。

**6. stream-json → OpenAI SSE 映射。**
`stream_event.delta.content` → `chat.completion.chunk` 的 `choices[0].delta.content`。demo 中丢弃 `delta.reasoning_content`。`type:"result"` → 带 `finish_reason:"stop"` 的收尾分片，随后 `data: [DONE]`。非流式请求可通过累积为单个补全对象来服务。

**7. 通过 opencode 插件管理生命周期。**
一个插件（`plugin/trae-bridge.js`）在 opencode init 时启动转接层，在退出时结束它，监听固定本地端口（例如 `127.0.0.1:<port>`），使用户无需管理该进程。

## Risks / Trade-offs

- 命令行长度限制会截断过长历史 → 保留最近轮次；记录该限制；未来：有状态会话复用。
- opencode 看不到 traecli 的文件编辑（无 diff/undo）→ demo 阶段接受；用户通过 git 审查。
- plan/build 判断依赖 opencode 的提示词措辞 → 默认使用安全的 `plan`；若 opencode 更改措辞则需重新审视。
- 每请求 spawn 进程会给每一轮增加启动延迟 → demo 可接受；未来：常驻 `acp serve` 或会话复用。
- Trae 登录/令牌过期或网络错误 → 向 opencode 返回一个干净的错误补全，而非损坏的 JSON。
- 首轮内容可能被发送到 Trae 企业云（按设计如此）→ 对任何代码外发合规顾虑做提示；demo 范围外。

## Migration Plan

1. 在 `~/.config/opencode/` 下添加 `trae-bridge/server.js` 和 `plugin/trae-bridge.js`。
2. 编辑 `opencode.jsonc`，注册插件与 `trae` provider（baseURL → 本地转接层、模型列表、默认模型）。
3. 重启 opencode（配置在启动时加载一次）。
4. 通过验收场景验证（模型列表、模型切换、流式、plan/build）。
5. 回滚：从 `opencode.jsonc` 移除插件/provider 条目并重启；删除这两个文件。不触及其它状态。

## Open Questions

- opencode 用于区分 plan 与 build 模式所发送的确切请求信号（在实现阶段针对真实 opencode 请求确认）。
- demo 是否需要非流式支持，还是仅流式即足以完成首轮验证。
