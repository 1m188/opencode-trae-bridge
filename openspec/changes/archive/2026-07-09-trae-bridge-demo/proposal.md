## Why

公司提供了企业版 Trae CLI（`traecli.exe`）编码 Agent，但它缺少 opencode 那样的会话管理等好用功能。字节没有开放裸模型 API，只提供完整的 Agent CLI。我们希望在 opencode 的 TUI 里使用 Trae 的模型和 Agent 能力——包括 `/models` 切换模型、`/session` 历史、plan/build 模式——同时消耗 Trae 企业版额度，而不是 opencode 自己的模型额度。

## What Changes

- 新增一个本地 HTTP 转接服务，对 opencode 呈现 OpenAI 兼容 API（`/v1/models`、支持流式的 `/v1/chat/completions`）。
- 转接层把每个 opencode 请求翻译成无头调用 `traecli -p --output-format stream-json`，将选中的模型映射为 `-c model.name=<model>`，将 opencode 的 plan/build 模式映射为 `--permission-mode`。
- 新增一个 opencode 插件，在 opencode 启动时自动拉起转接层进程，退出时关闭它。
- 在 opencode 配置中注册一个 `trae` provider，使 Trae 模型出现在 `/models` 选择器里。
- 本 demo 范围刻意保持最小：用少量模型跑通端到端链路（模型切换、流式、plan/build 翻译）。不做命令映射，不做有状态会话复用。

## Capabilities

### New Capabilities
- `trae-bridge`: 一个本地 OpenAI 兼容 HTTP 服务，封装企业版 Trae CLI，将 Trae 模型暴露给 opencode 并流式回传 Agent 响应。
- `opencode-trae-integration`: opencode 侧的配置与生命周期插件，负责注册 `trae` provider 并管理转接层进程。

### Modified Capabilities
<!-- 无：这是全新集成，不改动任何已有 spec。 -->

## Impact

- `~/.config/opencode/` 下的新代码：一个 Node 转接服务（`trae-bridge/server.js`）和一个生命周期插件（`plugin/trae-bridge.js`）。
- 对 `~/.config/opencode/opencode.jsonc` 的配置改动：注册插件、`trae` provider、其模型列表和默认模型。
- 依赖：已安装的企业版 `traecli.exe`（位于 `%LOCALAPPDATA%\trae-cli\bin\traecli.exe`）、已登录的 Trae 会话（环境变量 `TRAECLI_PERSONAL_ACCESS_TOKEN`）、以及 Node.js（已存在，v24）。
- 已知约束：prompt 通过命令行参数传入（stdin/`--file` 均不支持），因此历史长度受操作系统命令行长度限制；opencode 不追踪 traecli 所做的文件改动；plan/build 的判断依赖于识别 opencode 注入的系统提示词。
