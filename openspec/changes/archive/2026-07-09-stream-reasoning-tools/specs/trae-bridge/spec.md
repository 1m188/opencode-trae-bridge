## MODIFIED Requirements

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
