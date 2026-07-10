## MODIFIED Requirements

### Requirement: 流式响应

当请求设置 `"stream": true` 时，转接层 SHALL 支持使用 Server-Sent Events 的流式响应，将 Trae CLI 的 `stream-json` 输出翻译为 OpenAI 流式分片。转接层 SHALL 将 Agent 的思考过程与内部工具调用翻译为可见的思考内容（`reasoning_content`）。转接层 SHALL 将 traecli 产出的 `delta.content`（含中间叙述与最终答案）逐字实时流式输出为正文（`delta.content`）SSE 分片，使用户可在生成过程中看到正文并支持中途中断。转接层 SHALL NOT 将 traecli 的内部工具调用作为 OpenAI `tool_calls` 转发给调用方。

转接层 SHALL 在收到 `result` 事件后发送收尾标记（`finish_reason: "stop"` 与 `data: [DONE]`），SHALL NOT 在 `result` 处重复输出正文——因正文已通过前序 `delta.content` 流式发送完毕。若 traecli 全程未产出任何 `delta.content`（直接以 `result` 给出答案），转接层 SHALL 在收尾时补发 `result` 正文作为兜底。

#### Scenario: 思考内容分片

- **WHEN** traecli 输出带有 `delta.reasoning_content` 的 `stream_event` 行
- **THEN** 转接层将该思考增量转发为 `chat.completion.chunk`，其 `choices[0].delta.reasoning_content` 为该增量，使 opencode 渲染为思考块

#### Scenario: 正文流式输出（含中间叙述）

- **WHEN** traecli 输出带 `delta.content` 的 `stream_event` 行（可能为中间叙述如「让我先列出文件…」，也可能为最终答案的增量）
- **THEN** 转接层即时将该 `delta.content` 作为 `choices[0].delta.content` 通过 SSE 发送，实现正文逐字流式输出。中间叙述（噪声）与最终答案一视同仁、均实时输出。同时 SHALL 累积 `delta.content` 作为「traecli 未产生 result 事件」时的兜底

#### Scenario: 工具调用可见

- **WHEN** traecli 输出 `type:"assistant"` 消息且其中含带完整 `name` 与 `arguments` 的 `tool_calls`（实测为单个对象或数组）
- **THEN** 转接层为每个工具调用生成一行简洁状态文本（如 `→ 调用 LS(path=…)`），并作为 `choices[0].delta.reasoning_content` 输出到思考块

#### Scenario: 内部工具不作为 tool_calls 转发

- **WHEN** traecli 执行其内建工具（如 `LS`、`Bash`）
- **THEN** 转接层不在响应中输出 OpenAI 格式的 `tool_calls` 字段，避免 opencode 误判为需自行执行工具

#### Scenario: result 收尾不重复正文

- **WHEN** traecli 输出其最终的 `result` 行，且正文已通过前序 `delta.content` 流式输出完毕
- **THEN** 转接层 SHALL NOT 再次输出 `choices[0].delta.content`（正文已流式发送），仅发送带 `finish_reason: "stop"` 的收尾分片与 `data: [DONE]` 结束标记

#### Scenario: 无流式正文时的 result 兜底

- **WHEN** traecli 全程未产出任何 `delta.content`（例如无工具的简短回答），直接以 `result` 给出答案
- **THEN** 转接层 SHALL 将 `result` 文本作为 `choices[0].delta.content` 分片输出，随后发送收尾分片与 `data: [DONE]`
