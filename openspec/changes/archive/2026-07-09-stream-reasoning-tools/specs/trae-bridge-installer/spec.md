## ADDED Requirements

### Requirement: 派生 provider 启用思考内容渲染

安装脚本在派生 opencode `provider.trae` 时，SHALL 为每个模型加入 `reasoning: true` 与 `interleaved: { field: "reasoning_content" }`，使 opencode 将转接层输出的思考内容渲染为独立思考块，并在多轮对话中保留思考上下文。其中 `reasoning: true` 是渲染思考块的必要开关（自定义 provider 默认为 `false`，不设则思考块不显示）；`interleaved` 指定跨轮保留思考所用的字段名。

#### Scenario: 模型配置含 reasoning 与 interleaved 字段

- **WHEN** 用户运行 `node scripts/install.mjs` 派生 `provider.trae`
- **THEN** 写入 opencode 配置的每个 `provider.trae.models.<id>` 均含 `reasoning: true` 与 `interleaved: { field: "reasoning_content" }`

#### Scenario: 思考块正确渲染

- **WHEN** 用户在 opencode 中使用已配置的 trae 模型对话，且转接层输出 `reasoning_content`
- **THEN** opencode 将思考内容渲染为独立思考块，而非丢弃或混入正文
