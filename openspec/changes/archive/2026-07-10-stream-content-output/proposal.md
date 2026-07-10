## Why

当前 trae-bridge 将 traecli 的 `delta.content`（最终回答正文）在流式期间全部抑制，仅在收到 `result` 事件后一次性批量输出。用户无法在模型生成过程中看到正文的逐字输出，导致无法及时判断生成方向是否正确并中断重试。实测确认 AI SDK 已内置推理生命周期事件（`reasoning-start`/`reasoning-end`/`text-start`），为正文与思考的交错渲染提供了协议级支持。

## What Changes

- 正文（`delta.content`）改为逐字流式输出，在 traecli 产出每一行时立即通过 SSE 发送
- 移除"流式期间抑制中间叙述"的行为——中间叙述（如「让我先看看代码…」）也将随正文一同流式输出（已知且接受的噪声）
- `result` 事件不再重复输出正文（因已在前序 `delta.content` 中流式发送），仅发收尾标记
- `parseStream()` 新增 `onContent` 回调，供调用方消费正文增量

## Capabilities

### New Capabilities
<!-- 无新增能力，仅修改现有能力的行为 -->
无。

### Modified Capabilities
- `trae-bridge`: 修改「流式响应」需求——将"抑制中间叙述、result 一次性输出正文"改为"delta.content 实时流式输出、result 不再重复输出"

## Impact

- `src/server.js` — `parseStream()` 新增 `onContent` 回调、`handleStreaming()` 流式转发正文、`finish()` 跳过重复输出
- 核心协议无变化——仍用 `delta.content` 字段，opencode 无需适配
- 非流式路径与错误路径不受影响
