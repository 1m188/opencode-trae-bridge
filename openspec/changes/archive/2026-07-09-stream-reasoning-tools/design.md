## Context

现状：`src/server.js` 的 `parseStream()` 逐行解析 traecli 的 NDJSON，仅转发 `stream_event.delta.content`（正文增量），在 `type:"result"` 时收尾。`design.md`（demo 阶段）明确"丢弃 reasoning_content"。因此模型进入思考+工具调用阶段时，opencode 界面正文长时间无输出，用户误以为卡死。

已实测 traecli stream-json 的真实事件类型：
- `stream_event.delta.content`：正文增量。
- `stream_event.delta.reasoning_content`：思考增量。
- `stream_event.delta.tool_calls`：分片式工具调用（首片带 `function.name`，后续片带 `function.arguments` 增量，`id` 可能为空）。
- `type:"assistant"` 消息：含完整聚合的 `tool_calls`（`name` + 完整 `arguments`）。
- `type:"user" subtype:"tool_result"`：工具执行结果。
- `type:"result"`：最终 `result` 文本。

已核实 opencode 侧：`@ai-sdk/openai-compatible` 会解析 SSE 中的 `delta.reasoning_content` 并作为 `reasoning-delta` 渲染成思考块；跨轮保留思考需模型配置 `interleaved: { field: "reasoning_content" }`（DeepSeek 系会自动默认，但 GLM/Kimi/Qwen 等需显式设置）。

## Goals / Non-Goals

**Goals:**
- 流式响应把 `reasoning_content`（思考）转发出去，渲染为思考块。
- 把内部工具调用转成可见的单行状态文本（如 `→ 调用 LS(path=…)`），放入思考块，正文保持干净。
- 流式期间中间叙述（`delta.content`）也归入思考块，正文只在收尾时以最终 `result` 一次性输出，保证「过程 → 最终答案」时序正确（详见决策 7）。
- 派生 provider 时为每个模型加 `reasoning: true` 与 `interleaved: { field: "reasoning_content" }`（详见决策 6）。
- 消除"正文长时间不动"的卡死错觉。

**Non-Goals:**
- 不把 traecli 内部工具调用作为真正的 OpenAI `tool_calls` 转发给 opencode。
- 不显示工具执行结果（`tool_result`）内容。
- 不改变非流式路径的最终返回内容。
- 不在 opencode 的 diff/undo 中追踪 traecli 的文件改动。

## Decisions

**决策 1：思考内容映射为 SSE `delta.reasoning_content`。**
- 选择：`parseStream()` 识别 `delta.reasoning_content`，经新回调 `onReasoning` 在 `handleStreaming()` 中转发为 `chunkObject` 的 `delta.reasoning_content`。
- 理由：`@ai-sdk/openai-compatible` 原生识别该字段并渲染思考块，正文不受污染。
- 备选：把思考混入 `delta.content` 正文——被否，会污染最终回复。

**决策 2：工具调用取聚合后的 `type:"assistant".tool_calls`，转成单行文本进思考块。**
- 选择：监听 `type:"assistant"` 消息（此时 `name` 与 `arguments` 已完整），为每个工具调用生成 `→ 调用 <name>(<简要参数>)` 一行，作为 `reasoning_content` 输出。参数做简要展示（截断/精简），避免刷屏。
- 理由：聚合消息含完整信息，无需自己缝合分片 `delta.tool_calls`；放思考块保持正文干净（用户已选此项）。
- 备选：解析分片 `delta.tool_calls` 实时拼接——被否，`id`/`arguments` 分片处理复杂且易错，聚合消息已足够。

**决策 3：内部工具调用不作为 OpenAI `tool_calls` 转发。**
- 选择：不在 SSE 分片里输出 `delta.tool_calls` 字段；工具调用仅以文本形式呈现。
- 理由：Trae 是自带工具的完整 Agent，工具在 traecli 内部执行；若作为真 tool_calls 转发，opencode 会以为该它执行工具，破坏流程。

**决策 4：派生 provider 时为每个模型加 `interleaved`。**
- 选择：`deriveProvider()` 生成 `models[id] = { name, interleaved: { field: "reasoning_content" } }`。
- 理由：确保非 DeepSeek 模型也能正确渲染并跨轮保留思考。
- 备选：依赖 opencode 对 deepseek 的自动默认——被否，覆盖不到 GLM/Kimi/Qwen 等。

**决策 5：非流式路径保持不变。**
- 选择：`handleNonStreaming()` 仍只累积正文（`onResult`/`onClose`），忽略思考与工具行。
- 理由：非流式仅取最终结果，简洁即可。

**决策 6（实现期修正）：思考块渲染依赖 `capabilities.reasoning:true`，而非 `interleaved`。**
- 背景：初版仅设 `interleaved` 未设 `reasoning`，导致思考块完全不显示。
- 实测（反编译 opencode 二进制）：opencode 自定义 provider 的模型能力默认 `reasoning:false`，用它门控是否渲染思考块；`interleaved` 仅控制跨轮保留思考的字段名。二者均为**模型配置的顶层字段**（`f.reasoning`、`f.interleaved`），经 `capabilities` 映射生效。
- 选择：`deriveProvider()` 为每个模型同时设 `reasoning: true` 与 `interleaved: { field: "reasoning_content" }`。

**决策 7（实现期修正）：正文只输出最终 `result`，中间叙述与思考、工具统一进思考块。**
- 背景：opencode 只有「正文」与「思考」两条并行显示车道，两车道之间不保证按时间严格交错。若把中间叙述（`delta.content`）实时当正文输出，会出现「工具思考块虽先发生却排在正文下方」的错乱时序。
- 实测（干净 UTF-8 抓包）：真实事件顺序为 `思考 → 中间叙述 → 工具调用 → 思考 → 最终答案(content) → result`；其中 `result` 事件携带纯净的最终答案。
- 选择：流式期间 `delta.content` 不作为正文输出；思考、工具、中间叙述全部进思考块；收尾时把 `result` 作为唯一 `delta.content` 一次性输出。时序结果：`[思考块(推理+工具+中间叙述)] → [最终答案]`。
- 备选：把工具调用作为真 `tool_calls` 转发以获得原生灰色工具行——被否，Trae 工具已在 traecli 内部执行完，转发会让 opencode 误以为需自行执行，破坏流程。
- 代价：最终答案不再逐字流式，在收尾一次性出现；换取正确时序与干净正文。

**工具调用结构修正：** 实测 `type:"assistant"` 的工具调用位于 `evt.message.tool_calls`，且可能是单个对象（非数组），解析时统一规整为数组。

## Risks / Trade-offs

- [思考块内工具行措辞/参数过长刷屏] → 参数简要展示并按需截断。
- [traecli 未来调整事件结构（字段名/消息类型）] → 解析集中在 `parseStream()`，单处适配。
- [opencode 版本差异导致 reasoning_content 渲染行为不同] → 已核实当前 `@ai-sdk/openai-compatible` 支持；README 注明依赖。
- [interleaved 字段写入既有 opencode 配置] → 通过既有"备份 + 深合并"机制安全写入，可回滚。

## Migration Plan

1. 改 `src/server.js`：`parseStream()` 增加 `onReasoning` 与 `onToolCall` 回调并解析工具调用（`evt.message.tool_calls`）；`handleStreaming()` 将思考与工具行转发为 `delta.reasoning_content`，流式期间不输出正文，收尾时把最终 `result` 作为唯一 `delta.content` 一次性输出。
2. 改 `scripts/lib/config.mjs`：`deriveProvider()` 为每个模型加 `reasoning: true` 与 `interleaved: { field: "reasoning_content" }`。
3. 更新 `README.md`：说明思考、中间叙述、工具调用进入思考块，最终答案作为正文输出。
4. 本地验证：重装 → 重启 opencode → 用会触发思考+工具的问题验证思考块与工具行出现、正文只含最终答案且排在思考块之后。
5. 回滚：还原 `src/server.js` 与 `deriveProvider()`，重装。

## Open Questions

- 无阻塞项。工具行的参数精简程度可在实现时按实际观感微调。
