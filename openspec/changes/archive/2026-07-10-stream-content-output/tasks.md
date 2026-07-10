## 1. parseStream 新增 onContent 回调

- [x] 1.1 `parseStream()` 签名增加第 4 个参数 `onContent`（插入在 `onToolCall` 与 `onResult` 之间）
- [x] 1.2 在 `stream_event.delta.content` 处理分支中调用 `onContent(delta.content)`（若回调存在）
- [x] 1.3 更新函数注释，描述 `onContent` 回调职责

## 2. handleStreaming 流式转发正文

- [x] 2.1 新增 `streamedContent` 布尔标志，初始为 `false`
- [x] 2.2 在 `parseStream` 调用中注入 `onContent` 回调：设置 `streamedContent = true` 并通过 `send()` 发送 `{ content: contentPiece }` SSE 分片
- [x] 2.3 修改 `finish()`：仅在 `!streamedContent && finalAnswer` 时补发正文（兜底路径）
- [x] 2.4 更新 `finish()` 注释，说明新收尾逻辑

## 3. handleNonStreaming 透传空回调

- [x] 3.1 在非流式路径的 `parseStream` 调用中插入空回调 `() => {}` 作为第 4 个参数

## 4. 同步主规格与验证

- [x] 4.1 用 delta spec 的 MODIFIED 内容覆盖 `openspec/specs/trae-bridge/spec.md` 中「流式响应」需求（含全部场景）
- [x] 4.2 运行 `npm run install-bridge` 重装，用 opencode 验证正文逐字流式输出
- [x] 4.3 确认非流式路径行为不变（`stream: false` 请求返回格式不变）
