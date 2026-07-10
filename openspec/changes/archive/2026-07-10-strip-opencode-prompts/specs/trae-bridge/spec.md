## ADDED Requirements

### Requirement: opencode 提示词剥离

bridge SHALL 在将 opencode 发来的 messages 转发给 traecli 之前，自动剥离所有 opencode 附加的提示词内容，确保 traecli 收到的 prompt 与用户在终端直接运行 traecli 时一致。剥离操作 SHALL NOT 删除对话历史（user 正文、assistant 正文与 tool_calls、tool 返回值）。

具体规则：
1. SHALL 丢弃所有 `role` 为 `"system"` 的消息
2. SHALL 从所有消息的 `content` 中移除 `<EXTREMELY_IMPORTANT>...</EXTREMELY_IMPORTANT>` 块（包括开闭标签内的所有内容）
3. SHALL 从所有消息的 `content` 中移除 `<system-reminder>...</system-reminder>` 块（包括开闭标签内的所有内容）
4. SHALL NOT 修改或删除对话历史中的 user 正文、assistant 正文、tool_calls 字段或 tool 消息

清理后的 messages SHALL 被正常传递给 `buildPrompt()` 和 `derivePermissionMode()`。由于所有 system 消息（含 opencode 的 plan 信号 `<system-reminder>`）均被移除，`derivePermissionMode()` 将自然回退到 `DEFAULT_PERMISSION_MODE`（`bypass_permissions`），行为正确。

此行为 SHALL 全局启用，无开关配置。

#### Scenario: system 消息被丢弃

- **WHEN** opencode 发来的 messages 中含多条 `role: "system"` 消息（qwen.txt 指令、环境信息、工具定义等）
- **THEN** 经剥离后这些消息不在 prompt 中，traecli 收到的 prompt 不含任何 SYSTEM 前缀行

#### Scenario: superpowers 引导被移除

- **WHEN** 首条 user 消息的 `content` 中含 `<EXTREMELY_IMPORTANT>...</EXTREMELY_IMPORTANT>` 块（superpowers 插件注入）
- **THEN** 该 XML 块及其全部内容被移除，仅保留用户的原始提问文本

#### Scenario: plan mode 提醒被移除

- **WHEN** 消息的 `content` 中含 `<system-reminder>...</system-reminder>` 块（opencode plan mode 注入）
- **THEN** 该 XML 块及其全部内容被移除

#### Scenario: 对话历史原样保留

- **WHEN** messages 中含多轮 user/assistant 对话历史，包括 assistant 的 `tool_calls` 字段和 `role: "tool"` 的工具返回值消息
- **THEN** 这些内容的 `content` 正文、`tool_calls` 字段、`role` 字段均原样保留，仅移除其中嵌入的 opencode 注入块

#### Scenario: 权限模式回退到可写

- **WHEN** 请求的 messages 被剥离后不再含 `Plan mode is active` 信号（该信号原本在 `<system-reminder>` 或 system 消息中）
- **THEN** `derivePermissionMode()` 返回 `bypass_permissions`，traecli 以可写模式运行
