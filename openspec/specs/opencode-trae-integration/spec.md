# opencode-trae-integration

## Purpose

TBD — opencode 与 Trae CLI 的集成规范，定义 provider 注册、转接层生命周期管理和会话历史保留的行为。

## Requirements

### Requirement: Trae provider 注册

opencode SHALL 配置一个名为 `trae` 的自定义 provider（使用 OpenAI 兼容的 provider 包），其 base URL 指向本地转接层，使 Trae 模型出现在 `/models` 选择器中的 `trae` provider 下。

#### Scenario: Trae 模型出现在模型选择器中

- **WHEN** opencode 在已配置 `trae` provider 且转接层运行的情况下启动
- **THEN** `/models` 选择器在 `trae` provider 下列出已配置的 Trae 模型（例如 `trae/DeepSeek-V4-Pro`、`trae/GLM-5.2`）

#### Scenario: 选择 Trae 模型时路由到转接层

- **WHEN** 用户选择某个 `trae/<model>` 条目并发送消息
- **THEN** opencode 将请求发送到本地转接层的 base URL，且回复由企业版 Trae CLI 产生

### Requirement: 转接层生命周期管理

一个 opencode 插件 SHALL 在 opencode 启动时拉起转接层进程，并在 opencode 退出时关闭它，使用户无需手动管理该进程。

#### Scenario: 转接层自动启动

- **WHEN** opencode 在插件启用的情况下启动
- **THEN** 插件在配置的本地端口上启动转接层服务

#### Scenario: 转接层随退出而关闭

- **WHEN** opencode 退出
- **THEN** 插件终止它所启动的转接层进程

### Requirement: 会话历史由 opencode 保留

该集成 SHALL 依赖 opencode 存储对话历史，使 opencode 现有的会话功能继续正常工作。

#### Scenario: 切换会话后历史仍可用

- **WHEN** 用户使用某个 `trae` 模型进行对话，随后用 `/session` 切换会话
- **THEN** 先前的对话及其上下文在 opencode 的历史中仍然可用
