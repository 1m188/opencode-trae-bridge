## ADDED Requirements

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

当请求设置 `"stream": true` 时，转接层 SHALL 支持使用 Server-Sent Events 的流式响应，将 Trae CLI 的 `stream-json` 输出翻译为 OpenAI 流式分片。

#### Scenario: 增量内容分片

- **WHEN** 发起一个流式对话补全请求，且 traecli 输出带有 `delta.content` 的 `stream_event` 行
- **THEN** 转接层将每个增量转发为一个 OpenAI `chat.completion.chunk`，其 `choices[0].delta.content` 为该增量

#### Scenario: 流结束

- **WHEN** traecli 输出其最终的 `result` 行
- **THEN** 转接层发送一个带 `finish_reason: "stop"` 的收尾分片，随后发送 `data: [DONE]` 结束标记

### Requirement: 权限模式翻译

转接层 SHALL 将调用方的 plan/build 意图映射到 Trae CLI 的 `--permission-mode` 参数，使 plan 模式为只读、build 模式可修改文件。

#### Scenario: plan 模式为只读

- **WHEN** 请求指示为 plan 模式
- **THEN** 转接层以 `--permission-mode plan` 调用 traecli，且 traecli 不修改文件

#### Scenario: build 模式可修改文件

- **WHEN** 请求指示为 build 模式
- **THEN** 转接层以 `--permission-mode bypass_permissions` 调用 traecli，允许文件改动

### Requirement: 输出隔离干净

转接层 SHALL 仅读取 Trae CLI 的标准输出流来解析 Agent 结果，忽略标准错误，从而使登录/INFO 日志噪声不会污染解析出的 JSON。

#### Scenario: 登录日志不污染输出

- **WHEN** traecli 在请求期间向 stderr 写入登录/INFO 消息
- **THEN** 转接层仍能从 stdout 解析出有效响应，且不包含 stderr 内容
