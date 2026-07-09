## Why

使用 Trae 模型时，模型的思考过程（`reasoning_content`）与内部工具调用（如 `LS`、`Bash`）当前被转接层丢弃，界面上正文长时间不动，用户误以为对话卡死或已结束。应把这些中间活动呈现出来，让用户实时看到 Agent 正在思考和执行工具。

## What Changes

- 转接层将 traecli 的 `delta.reasoning_content`（思考增量）翻译为 OpenAI SSE 的 `delta.reasoning_content`，让 opencode 渲染为思考块。
- 转接层将 traecli 的内部工具调用（`type:"assistant"` 消息中的 `tool_calls`）转成可见的状态行（如 `→ 调用 LS(path=…)`），一并作为 `reasoning_content` 输出到思考块。
- 内部工具调用不作为真正的 OpenAI `tool_calls` 转发，避免 opencode 误以为需要自己执行工具。
- 流式期间中间叙述（`delta.content`）也归入思考块；仅将 traecli 的最终 `result` 作为正文一次性输出，保证「过程 → 最终答案」时序正确、正文干净。
- 安装派生的 opencode `provider.trae` 为每个模型加入 `reasoning: true` 与 `interleaved: { field: "reasoning_content" }`，使 opencode 正确渲染并跨轮保留思考内容。
- 非流式响应仍只返回最终正文，忽略思考与工具行。

## Capabilities

### New Capabilities
<!-- 无新增能力，本次为对既有转接层与安装器能力的修改 -->

### Modified Capabilities
- `trae-bridge`: 流式响应新增将 `reasoning_content` 与内部工具调用翻译为可见的思考内容；明确内部工具调用不作为 OpenAI tool_calls 转发。
- `trae-bridge-installer`: 派生的 `provider.trae` 模型配置加入 `interleaved: { field: "reasoning_content" }`。

## Impact

- 修改文件：`src/server.js`（`parseStream()` 与 `handleStreaming()`）、`scripts/lib/config.mjs`（`deriveProvider()`）、`README.md`。
- 不影响非流式路径的最终返回内容。
- 依赖：opencode 的 `@ai-sdk/openai-compatible` 已支持解析 `reasoning_content` 并渲染思考块（已核实）。
