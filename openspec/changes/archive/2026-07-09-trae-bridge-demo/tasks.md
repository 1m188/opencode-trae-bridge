## 1. 转接层脚手架

- [x] 1.1 创建 `~/.config/opencode/trae-bridge/server.js`，使用 Node 内置 `http` 模块（无第三方依赖），监听 `127.0.0.1` 的固定端口
- [x] 1.2 在 `server.js` 顶部添加配置块：traecli 路径（`%LOCALAPPDATA%\trae-cli\bin\traecli.exe`）、端口、以及要暴露的 Trae 模型列表（先用 `DeepSeek-V4-Pro`、`GLM-5.2`、`Kimi-K2.7-Code`）
- [x] 1.3 添加一个用于解析 traecli 可执行文件路径的辅助函数（找不到时回退到 PATH 上的 `trae-cli`），并在启动时校验其存在

## 2. 模型列表端点

- [x] 2.1 实现 `GET /v1/models`，从已配置的模型列表返回 `{ "object": "list", "data": [{ "id": "<model>", "object": "model", ... }] }`
- [x] 2.2 用 `curl http://127.0.0.1:<port>/v1/models` 手动验证所有已配置模型都被返回

## 3. 对话补全核心

- [x] 3.1 实现 `POST /v1/chat/completions`：解析 JSON 请求体，提取 `model`、`messages` 和 `stream`
- [x] 3.2 将 `messages[]` 拼平为单个 prompt 字符串；若超过 Windows 命令行限制（约 32K 字符），保留最近轮次
- [x] 3.3 推导权限模式：build → `bypass_permissions`，plan → `plan`；信号不明确时默认 `plan`
- [x] 3.4 以 `-p --output-format stream-json --include-partial-messages -c "model.name=<model>" --permission-mode <mode> "<prompt>"` spawn traecli，只读 stdout（忽略/记录 stderr）

## 4. 流式翻译

- [x] 4.1 逐行解析 traecli stdout 的 NDJSON；遇到带 `delta.content` 的 `type:"stream_event"` 时，发出一个 OpenAI `chat.completion.chunk` SSE，其 `choices[0].delta.content` 为该增量
- [x] 4.2 遇到 `type:"result"` 时，发出一个带 `finish_reason:"stop"` 的收尾分片，随后 `data: [DONE]`
- [x] 4.3 设置 SSE 响应头（`Content-Type: text/event-stream`、no-cache），并在分片到达时立即刷新
- [x] 4.4 添加非流式回退：当 `stream` 为 false 时，累积内容并返回单个补全对象
- [x] 4.5 traecli spawn/解析出错时，返回一个干净的错误补全（绝不输出损坏的 JSON）

## 5. opencode 集成

- [x] 5.1 创建 `~/.config/opencode/plugin/trae-bridge.js`，在 opencode init 时将 `server.js` 作为子进程启动，并在退出时终止它
- [x] 5.2 编辑 `~/.config/opencode/opencode.jsonc`：注册插件，并添加一个使用 `@ai-sdk/openai-compatible` 的 `trae` provider，其 `baseURL` 指向本地转接层，`models` 下列出模型列表
- [x] 5.3 为 `trae` provider 设置一个合理的默认模型

## 6. 端到端验证

- [x] 6.1 重启 opencode；确认 `/models` 列出了 `trae/*` 模型
- [x] 6.2 选择一个 `trae` 模型，发送消息，确认出现流式回复（打字机效果）
- [x] 6.3 切换到另一个 `trae` 模型，确认回复由该模型产生
- [x] 6.4 在 plan 模式下要求 traecli 修改文件并确认它不会修改；在 build 模式下确认它可以修改
- [x] 6.5 使用 `/session` 切走再切回，确认对话历史被保留
