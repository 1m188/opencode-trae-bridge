## 1. 转接层解析思考与工具调用

- [x] 1.1 `src/server.js` 的 `parseStream()` 新增识别 `stream_event.delta.reasoning_content`，经新回调 `onReasoning(增量)` 上报
- [x] 1.2 `parseStream()` 新增识别 `type:"assistant"` 消息中的 `tool_calls`，为每个调用拼成 `→ 调用 <name>(<简要参数>)` 文本，经新回调 `onToolCall(行文本)` 上报
- [x] 1.3 工具调用参数做简要展示与按需截断，避免刷屏
- [x] 1.4 确认不输出 OpenAI 格式的 `delta.tool_calls` 字段（内部工具不作为 tool_calls 转发）

## 2. 流式响应输出思考块

- [x] 2.1 `handleStreaming()` 将 `onReasoning` 增量转发为 `chunkObject` 的 `delta.reasoning_content`
- [x] 2.2 `handleStreaming()` 将 `onToolCall` 文本行同样作为 `delta.reasoning_content` 输出到思考块
- [x] 2.3 流式期间中间叙述（`delta.content`）不作为正文输出，改为收尾时把最终 `result` 作为唯一正文一次性输出；保留 `finish_reason:"stop"` + `[DONE]`
- [x] 2.4 `handleNonStreaming()` 保持只累积正文，忽略思考与工具行

## 3. 派生 provider 启用思考渲染

- [x] 3.1 `scripts/lib/config.mjs` 的 `deriveProvider()` 为每个模型加入 `reasoning: true` 与 `interleaved: { field: "reasoning_content" }`

## 4. 文档

- [x] 4.1 更新 `README.md`：说明使用 trae 模型时思考过程、中间叙述与工具调用进入思考块，最终答案作为正文输出

## 5. 验证

- [x] 5.1 重新安装并重启 opencode
- [x] 5.2 用会触发思考+工具调用的问题验证（端到端抓包）：思考块含推理与工具行、正文只含最终答案且排在思考块之后
- [x] 5.3 确认多轮对话中思考上下文正确保留、无报错（用户手动验证）
