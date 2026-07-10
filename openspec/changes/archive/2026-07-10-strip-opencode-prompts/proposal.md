## 为什么

opencode 在通过 bridge 调用 trae 模型时，会在 prompt 中注入大量自有提示词（系统指令、工具定义、superpowers 引导、plan mode 提醒等），导致 trae 模型的回答风格与直接在终端运行 traecli 时存在显著差异——更简短、更保守、缺少反思性总结。用户在 opencode 中使用 trae 模型时，期望获得与原生 traecli 一致的体验，bridge 应作为纯粹桥接层，不传导 opencode 的提示词体系。

## 改什么

- bridge 在处理所有发往 traecli 的请求时，自动剥离 opencode 附加的提示词内容
- 删除所有 `role: "system"` 的消息（qwen.txt 指令、环境信息、工具定义等）
- 从所有消息的 `content` 中移除 `<EXTREMELY_IMPORTANT>...</EXTREMELY_IMPORTANT>` 块（superpowers 插件注入）
- 从所有消息的 `content` 中移除 `<system-reminder>...</system-reminder>` 块（opencode plan mode 注入）
- 对话历史（user 正文、assistant 正文与 tool_calls、tool 返回值）原封不动保留
- 权限模式检测逻辑因 system 消息被移除，自然回落到默认 `bypass_permissions`，行为正确
- 此行为全局启用，无需配置开关

## 能力

### 新增能力

无。

### 修改的能力

- `trae-bridge`: 新增「opencode 提示词剥离」需求——bridge 在将 opencode 消息转发给 traecli 前自动移除 opencode 附加的提示词内容

## 影响

- `src/server.js`: 新增 `stripMessages()` 函数，在 `buildPrompt()` 调用前对 messages 进行清洗
- `README.md`: 「工作原理」节补充说明 bridge 会自动剥离 opencode 注入内容
- 现有功能不受影响：流式输出、空闲超时、客户端断开检测、非流式路径等
- 对非 trae 模型无影响（只有 trae 请求经过 bridge）
