## Context

现状：trae-bridge 在流式路径中抑制所有 `delta.content`（中间叙述与最终答案），仅在收到 `result` 事件后一次性批量输出最终答案。决策依据（archive `2026-07-09-stream-reasoning-tools` 决策 7）是：中间叙述与最终答案共用同一条 `content` 流、无可靠分界标志，且 opencode 的思考与正文两条渲染车道不保证时序正确。

经过 spike 实测，该方案有两个用户体验问题：
1. 最终答案无法逐字流式显示，用户无法在生成中途判断方向并中断
2. 长回答时正文长时间空白，产生"卡死"错觉

AI SDK 已于 2026 年 3 月（PR #13394）修复了 `reasoning-end` 事件的时序问题——现在 SDK 在从 `reasoning_content` 切换到 `content` 时正确发射 `reasoning-end`，为思考/正文交错提供了协议级顺序保证。旧版 opencode 可能存在渲染时序问题，但实测影响有限，属于可接受的视觉噪声。

## Goals / Non-Goals

**Goals:**
- `delta.content` 实时流式输出为 SSE `delta.content` 分片，使最终答案逐字可见
- `result` 事件不再重复输出正文（已在前序 `delta.content` 中流式发送），仅发收尾标记
- 保持 `delta.reasoning_content`（思考）与 `assistant.tool_calls`（工具行）的现有行为不变
- 非流式路径行为不变

**Non-Goals:**
- 不区分中间叙述与最终答案——两者均流式输出（用户已明确接受此噪声）
- 不改变 opencode 的渲染逻辑（纯协议层改动）
- 不在思考块中重复正文内容

## Decisions

**决策 1：新增 `onContent` 回调替代内联累积。**

选择：`parseStream()` 增加第 8 个参数 `onContent`，在收到 `delta.content` 时调用。调用方（`handleStreaming`）通过此回调实时发送 `{ content: chunk }` 的 SSE 分片。`finalText` 继续累积作为 `onClose` 兜底。

理由：保持 `parseStream` 的角色单一（纯解析器），输出行为由调用方决定。与现有 `onReasoning`、`onToolCall` 模式一致。

备选：在 `parseStream` 内部直接调用 `send`——被否，耦合解析与传输，且非流式路径无需发送。

**决策 2：用 `streamedContent` 标记决定 `finish()` 是否补发正文。**

选择：`handleStreaming` 闭包中维护 `streamedContent` 布尔值，`onContent` 回调将其置为 `true`。`finish()` 仅在 `!streamedContent && finalAnswer` 时补发正文（兜底场景：traecli 全程未产出任何 `delta.content`，直接以 `result` 给出答案）。

理由：避免 `result` 事件重复输出已流式发送过的正文。

备选：比较 `result` 文本与累积的 `finalText` 是否相等——被否，相等不一定意味着未流式输出（中间叙述被累积但无 `result` 事件时也会相等），逻辑不可靠。

**决策 3：中间叙述不做过滤，全部流式输出。**

选择：不引入"首工具调用后开始流式"等启发式过滤。所有 `delta.content` 一视同仁，收到即发。

理由：用户已在 explore 阶段确认可接受中间叙述噪声。启发式过滤引入复杂度（多轮工具调用、无工具场景等边界情况），小收益不抵维护成本。

备选：仅在第一个 `assistant` 事件后开始流式 `delta.content`——被否，增加状态管理且不处理多轮工具调用间的叙述。

## Risks / Trade-offs

- [中间叙述（如「让我先看看代码…」）出现在正文气泡中] → 用户已接受。通常仅 1-2 句，不影响阅读体验。
- [opencode 旧版可能出现思考块与正文时序错乱] → AI SDK 已于 2026 年 3 月修复 `reasoning-end` 时序。若旧版仍有问题，影响仅限视觉、不损数据完整性。
- [result 文本与累积 `delta.content` 不一致（如 traecli bug）] → 当前方案以 `onClose` 时 `finalText` 为兜底；若 `result` 与流式正文有实质差异，用户看到的正文以流式阶段的为准（因为 `streamedContent` 已为 true，`finish` 不补发）。

## Migration Plan

1. 修改 `src/server.js` 三处：`parseStream` 签名、`handleStreaming` 流式转发、`handleNonStreaming` 透传空回调。
2. 正常运行 `npm run install-bridge` 重装。
3. 用 opencode 发起会触发多步思考+工具调用的请求，验证思考块与正文均正常显示、正文逐字流式输出。
4. 回滚：还原 `src/server.js` 至修改前，重装。

## Open Questions

- 无阻塞项。中间叙述噪声的实际体验需更多真实场景验证——若日后发现显著影响阅读，可在此基础上追加启发式过滤。
