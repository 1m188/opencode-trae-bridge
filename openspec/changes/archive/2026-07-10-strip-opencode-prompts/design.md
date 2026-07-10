## 上下文

opencode 向 bridge 发送 `POST /v1/chat/completions` 请求时，`messages` 数组中包含了 opencode 自有提示词体系的全部内容：

1. 多条 `role: "system"` 消息：provider 系统指令（qwen.txt）、环境信息、工具定义
2. 嵌入在 user 消息 `content` 中的 `<EXTREMELY_IMPORTANT>...</EXTREMELY_IMPORTANT>` 块（superpowers 插件注入）
3. 嵌入在消息 `content` 中的 `<system-reminder>...</system-reminder>` 块（opencode plan mode 注入）

当前 bridge 直接将完整 `messages` 数组传给 `buildPrompt()`，不做任何过滤，导致 traecli 收到包含大量 opencode 提示词的 prompt，影响了模型的回答风格。

## 目标 / 非目标

**目标：**
- 剥离所有 opencode 附加的提示词内容，使 traecli 收到的 prompt 与用户在终端直接运行 traecli 时一致
- 保留所有用户输入和对话历史（包括 traecli 产生的 tool_calls/tool 消息）
- 全局启用，无需配置开关

**非目标：**
- 不修改 opencode 自身的提示词生成逻辑（那是 opencode 内部的，bridge 控制不了）
- 不在 opencode 侧做任何过滤（插件 hook 等）
- 不影响非 trae 模型的请求（它们不会到达 bridge）
- 不提供按模型/按请求的细粒度过滤开关

## 决策

### 决策 1：在 bridge 侧过滤，而非 opencode 侧

**选择**：在 `handleChat` 中，于 `buildPrompt(messages)` 调用之前插入 `messages = stripMessages(messages)`。

**理由**：bridge 收到的是 opencode 拼装完成的最终 messages[]，在此处过滤可以一次性剥离所有层级的 opencode 注入，不需要逐个猜测 opencode 内部各层的注入方式。在 opencode 侧的插件 hook（`experimental.chat.system.transform` / `experimental.chat.messages.transform`）可能无法覆盖所有注入点（如工具定义、环境信息是 opencode 内部固定的），且 hook API 为 experimental 状态，不稳定。

**替代方案**：
- opencode 自定义 agent 的 `prompt` 字段覆盖：只能替换 provider 系统指令，无法去掉环境信息、工具定义和 superpowers 注入
- 在 opencode 侧写插件过滤：不确定能否覆盖全部注入点，且依赖 experimental API

### 决策 2：过滤范围——只删 opencode 注入内容

**选择**：三条规则：
1. 丢弃 `role === "system"` 的全部消息
2. 从所有消息的 `content` 中移除 `<EXTREMELY_IMPORTANT>...</EXTREMELY_IMPORTANT>` 块
3. 从所有消息的 `content` 中移除 `<system-reminder>...</system-reminder>` 块

**理由**：只有这三类内容是 opencode 额外注入的。对话历史中的 user 正文、assistant 正文和 tool_calls、tool 返回值都是对话自然产生的（traecli 的工具调用经 opencode 以 OpenAI 格式包装后混入），应原封不动保留。

**替代方案**：
- 同时删除 `role: "tool"` 和 assistant 的 `tool_calls` 字段：会丢失 traecli 工具调用的历史上下文，降低后续轮次的连贯性
- 仅删除 system 消息不做内容清洗：superpowers 引导和 plan mode 提醒仍会污染 prompt

### 决策 3：全局启用，无开关

**选择**：`stripMessages()` 始终在 `handleChat` 中调用，不提供 `rawMode` 配置开关。

**理由**：bridge 的定位就是「纯粹桥接」——用户在 opencode 中使用 trae 模型时，应该体感上就是直接用 traecli。这个行为没有需要关闭的场景（用户不会希望 opencode 的提示词污染 traecli 的输出）。

**替代方案**：提供一个 `rawMode` / `stripSystemPrompts` 配置开关：增加复杂度，且没有明确的关闭使用场景。

### 决策 4：`stripMessages()` 实现细节

```javascript
function stripMessages(messages) {
  return messages
    .filter((m) => m.role !== "system")                       // 规则 1
    .map((m) => {
      let content = contentToText(m.content);                  // 先规整为纯文本
      content = content                                       // 规则 2
        .replace(/<EXTREMELY_IMPORTANT>[\s\S]*?<\/EXTREMELY_IMPORTANT>/g, "")
      content = content                                       // 规则 3
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
      content = content.trim();
      return { ...m, content };
    })
    .filter((m) => m.content.length > 0);                      // 去除空 content
}
```

关键要点：
- 正则使用 `[\s\S]*?` 非贪婪匹配，正确处理跨行 XML 块
- 使用 `g` 标志以处理同一个 content 中可能出现多个块的情况
- 先 `contentToText` 规整为纯文本（兼容 `string` 和 `[{text}]` 两种格式），再清洗，保证正则准确匹配
- 最后 `filter` 丢弃 content 为空的消息（buildPrompt 也会过滤，但尽早过滤更干净）
- 使用 `{ ...m, content }` 展开原消息对象并覆写 `content` 字段，保留 `tool_calls`、`tool_call_id` 等非 content 字段

### 决策 5：权限模式检测的连锁影响

`derivePermissionMode()` 通过检测 messages 中的 `"plan mode is active"` 字符串来判定是否使用只读模式。剥离所有 system 消息和 `<system-reminder>` 块后，该检测将无法命中，自然回落到 `DEFAULT_PERMISSION_MODE`（`bypass_permissions`，可写模式）。这是正确的行为——strip 后的 prompt 相当于用户直接在终端用 traecli，不应受 opencode plan mode 约束。

## 风险 / 权衡

- **[风险] opencode 未来新增注入格式**（如新的 XML 包裹标签）→ 缓解：正则匹配失败时只是不洗掉该块，不会丢数据；发现新格式后添加对应规则即可
- **[风险] 正则匹配 `<EXTREMELY_IMPORTANT>` 可能误删用户输入**（如果用户故意输入该标签）→ 缓解：用户不可能自然输入这些标签，它们是 opencode 内部的特定定界符；极端情况下最多损失一块文本，不会影响核心功能
- **[权衡] 去除工具定义后 traecli 不知道 opencode 的工具体系**→ 这在当前设计中是故意的——traecli 有自己的内建工具（WebFetch/WebSearch/LS/Bash 等），不需要 opencode 的工具定义。opencode 对 trae 模型发出的工具调用请求，最终也是 bridge 转换为 traecli 原生格式来执行的
- **[权衡] 去除环境信息后模型不知道工作目录等上下文**→ traecli 的内建工具（LS/Bash 等）本身就运行在工作目录下，不需要 opencode 告知；对于纯知识性问题更无影响
