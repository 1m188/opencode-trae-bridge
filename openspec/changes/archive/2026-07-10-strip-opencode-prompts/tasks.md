## 1. 核心实现

- [x] 1.1 在 `src/server.js` 新增 `stripMessages(messages)` 函数，按设计文档决策 4 实现：丢弃 system 消息、移除 `<EXTREMELY_IMPORTANT>` 和 `<system-reminder>` XML 块、规整 content 为纯文本
- [x] 1.2 在 `handleChat()` 中，于 `buildPrompt(messages)` 和 `derivePermissionMode(messages)` 调用之前插入 `messages = stripMessages(messages)`
- [x] 1.3 验证 `buildPrompt` 自动过滤空 content 消息的逻辑不受影响

## 2. 验证

- [x] 2.1 运行 `node -c src/server.js` 确认语法正确
- [x] 2.2 手动安装 bridge 到 opencode：`node scripts/install.mjs`
- [x] 2.3 在 opencode 中使用 trae 模型进行简单对话，确认回答内容接近直接 traecli 的输出风格
- [x] 2.4 验证 ESC 中断、空闲超时、流式输出等现有功能未受影响

## 3. 文档

- [x] 3.1 更新 `README.md`「工作原理」节，补充说明 bridge 会自动剥离 opencode 注入的提示词内容
