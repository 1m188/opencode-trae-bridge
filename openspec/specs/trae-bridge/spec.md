# trae-bridge

## Purpose

Trae 转接层规范，定义 OpenAI 兼容的 HTTP API，将请求翻译为 Trae CLI 调用。

## Requirements

### Requirement: OpenAI 兼容的模型列表

转接层 SHALL 提供一个 HTTP `GET /v1/models` 端点，以 OpenAI 列表格式返回已配置的 Trae 模型，供 opencode 填充其 `/models` 选择器。

#### Scenario: 列出可用的 Trae 模型

- **WHEN** 客户端向转接层发送 `GET /v1/models`
- **THEN** 转接层返回 HTTP 200 及 JSON 体 `{ "object": "list", "data": [ ... ] }`，其中每一项的 `id` 对应一个已配置的 Trae 模型名（例如 `DeepSeek-V4-Pro`、`GLM-5.2`）

### Requirement: 经由 Trae CLI 的 OpenAI 兼容对话补全

转接层 SHALL 提供一个 HTTP `POST /v1/chat/completions` 端点，以无头模式运行企业版 Trae CLI 并返回 Agent 的响应。转接层 SHALL 调用 `traecli -p --output-format stream-json`，并将请求中的模型作为 `-c model.name=<model>` 传入。

#### Scenario: 请求中的模型驱动 Trae CLI 的模型

- **WHEN** 一个对话补全请求指定 `"model": "DeepSeek-V4-Pro"`
- **THEN** 转接层以 `-c "model.name=DeepSeek-V4-Pro"` 启动 traecli，且产生的响应由该模型生成

#### Scenario: 对话历史作为 prompt 传入

- **WHEN** 一个对话补全请求包含带有历史轮次的 `messages` 数组
- **THEN** 转接层将这些消息拼接进传给 traecli 的 prompt 参数，使 Agent 拥有对话上下文

### Requirement: 流式响应

当请求设置 `"stream": true` 时，转接层 SHALL 支持使用 Server-Sent Events 的流式响应，将 Trae CLI 的 `stream-json` 输出翻译为 OpenAI 流式分片。转接层 SHALL 将 Agent 的思考过程与内部工具调用翻译为可见的思考内容（`reasoning_content`），SHALL 抑制流式期间的中间叙述（不作为正文输出），并仅将 traecli 的最终 `result` 作为正文（`content`）在收尾时一次性输出，从而保证「过程 → 最终答案」的时序正确、正文干净。转接层 SHALL NOT 将 traecli 的内部工具调用作为 OpenAI `tool_calls` 转发给调用方。

#### Scenario: 思考内容分片

- **WHEN** traecli 输出带有 `delta.reasoning_content` 的 `stream_event` 行
- **THEN** 转接层将该思考增量转发为 `chat.completion.chunk`，其 `choices[0].delta.reasoning_content` 为该增量，使 opencode 渲染为思考块

#### Scenario: 抑制中间叙述

- **WHEN** traecli 在完成最终答案前输出带 `delta.content` 的 `stream_event` 行（如「让我先列出文件…」等中间叙述）
- **THEN** 转接层在流式期间不将其作为正文（`delta.content`）输出，也不进思考块；因为中间叙述与最终答案共用同一条 `content` 流、无可靠分界，若输出会与收尾的 `result`（最终答案）重复。最终答案统一由收尾的 `result` 输出。转接层仅累积 `delta.content` 作为「traecli 未产生 result 事件」时的兜底

#### Scenario: 工具调用可见

- **WHEN** traecli 输出 `type:"assistant"` 消息且其中含带完整 `name` 与 `arguments` 的 `tool_calls`（实测为单个对象或数组）
- **THEN** 转接层为每个工具调用生成一行简洁状态文本（如 `→ 调用 LS(path=…)`），并作为 `choices[0].delta.reasoning_content` 输出到思考块

#### Scenario: 内部工具不作为 tool_calls 转发

- **WHEN** traecli 执行其内建工具（如 `LS`、`Bash`）
- **THEN** 转接层不在响应中输出 OpenAI 格式的 `tool_calls` 字段，避免 opencode 误判为需自行执行工具

#### Scenario: 最终答案作为唯一正文

- **WHEN** traecli 输出其最终的 `result` 行
- **THEN** 转接层将 `result` 文本作为唯一的 `choices[0].delta.content` 分片输出，随后发送带 `finish_reason: "stop"` 的收尾分片与 `data: [DONE]` 结束标记，使正文只包含最终答案且排在思考块之后

### Requirement: 权限模式翻译

转接层 SHALL 将调用方的 plan/build 意图映射到 Trae CLI 的 `--permission-mode` 参数，使 plan 模式为只读、build 模式可修改文件。opencode 的 plan 模式通过在消息中注入以 `Plan mode is active` 开头的 `<system-reminder>` 表达；build 模式（opencode 默认态）不注入任何标记。因此转接层 SHALL 仅在检测到该 plan 信号时使用只读模式，其余情况（含无信号）SHALL 使用可写模式（默认 `bypass_permissions`），避免把 build 请求静默降级为只读。转接层 SHALL 采用精确短语匹配，而非宽松子串（如 `read-only`），以免正常对话内容触发误判。

#### Scenario: plan 模式为只读

- **WHEN** 请求消息中含以 `Plan mode is active` 开头的 plan 信号
- **THEN** 转接层以 `--permission-mode plan` 调用 traecli，且 traecli 不修改文件

#### Scenario: 无 plan 信号时可修改文件

- **WHEN** 请求消息中不含 plan 信号（opencode build 模式默认不注入任何标记）
- **THEN** 转接层以 `--permission-mode bypass_permissions` 调用 traecli，允许文件改动

#### Scenario: 正常对话内容不触发误判

- **WHEN** 请求消息正文恰好包含 `read-only`、`plan` 等词，但不含 `Plan mode is active` 这一精确 plan 信号
- **THEN** 转接层仍使用可写模式，不因宽松子串把 build 请求误降级为只读

### Requirement: 输出隔离干净

转接层 SHALL 仅读取 Trae CLI 的标准输出流来解析 Agent 结果，忽略标准错误，从而使登录/INFO 日志噪声不会污染解析出的 JSON。

#### Scenario: 登录日志不污染输出

- **WHEN** traecli 在请求期间向 stderr 写入登录/INFO 消息
- **THEN** 转接层仍能从 stdout 解析出有效响应，且不包含 stderr 内容

### Requirement: 空闲超时保护

转接层 SHALL 为每次 traecli 子进程设置空闲超时看门狗，其阈值通过环境变量 `TRAE_BRIDGE_IDLE_TIMEOUT_MS` 配置，缺省为 10 分钟（`600000` 毫秒）。转接层 SHALL 在每次从 traecli stdout 解析到任意有效 NDJSON 行时重置该看门狗。若在阈值内未产出任何新行，转接层 SHALL 判定 traecli 已卡死，终止子进程，并向客户端回报空闲超时错误。此机制 SHALL 同时适用于流式与非流式请求路径。

#### Scenario: 积极产出的长任务不被误杀

- **WHEN** traecli 持续产出 `stream_event`、`assistant` 或 `result` 事件，即便总运行时间远超空闲阈值
- **THEN** 每次 stdout 行重置看门狗，转接层不触发空闲超时，请求正常完成

#### Scenario: 静默超过程判定为卡死

- **WHEN** traecli 子进程已 spawn，但在空闲阈值时段内 stdout 未产出任何可解析 NDJSON 行
- **THEN** 转接层终止子进程，记录日志（含「空闲超时」字样及时长），并向客户端回报错误（含 `[trae-bridge 错误] 空闲超时（<毫秒>ms）`）

#### Scenario: 客户端断开时取消看门狗

- **WHEN** HTTP 客户端在请求未完成前断开连接（`res.on("close")`）
- **THEN** 转接层清除空闲超时看门狗并终止 traecli 子进程，避免残留定时器引用
