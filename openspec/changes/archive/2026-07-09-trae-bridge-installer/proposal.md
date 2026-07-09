## Why

Trae Bridge 的运行文件（转接层 server.js、生命周期插件、opencode provider 配置）目前散落在 opencode 的全局配置目录里，靠手工放置，既无法分发给他人，也无法在迭代时可靠地重装/回滚。需要把它整理成一个可克隆、可标准化安装/卸载的项目，让分发与测试都遵循统一流程。

## What Changes

- 将现有运行文件从 `~/.config/opencode/` 搬回本仓库，作为唯一的源代码：`src/server.js`、`src/trae-bridge.js`。
- 引入单一配置源 `config/trae.json`（端口、主机、traecli 路径、默认权限模式、prompt 上限、模型列表），同时驱动转接层与 opencode provider，消除模型列表两处重复维护。
- 改造 `src/server.js`：启动时优先读取安装目录下的 `config.json`，回退到现有环境变量/默认值；对外行为不变。
- 新增跨平台 Node 安装/卸载/状态脚本：`scripts/install.mjs`、`scripts/uninstall.mjs`、`scripts/status.mjs`，并配套 `scripts/lib/config.mjs`（解析 trae.json、定位 opencode 配置、JSONC 合并）。
- 安装脚本自动把 `provider.trae` 深合并进 opencode 配置，改动前带时间戳备份；不修改用户默认模型（不写 `model` 字段），避免劫持他人配置。
- 卸载脚本精确移除插件文件、转接层目录，并从 opencode 配置中删除 `provider.trae`（provider 清空后一并移除），同样先备份。
- 新增 `package.json`（`install`/`uninstall`/`status` 三个 npm scripts）与中文 `README.md`（安装、卸载、排障说明）。

## Capabilities

### New Capabilities
- `trae-bridge-installer`: 定义 Trae Bridge 的可分发项目结构、单一配置源，以及标准化的安装、卸载、状态检查流程（含 opencode 配置的安全合并与备份/回滚）。

### Modified Capabilities
<!-- 无：本次不改动 trae-bridge-demo 中转接层与集成的既有 spec 级行为，仅打包与安装编排。 -->

## Impact

- 新增文件：`config/trae.json`、`src/server.js`、`src/trae-bridge.js`、`scripts/lib/config.mjs`、`scripts/install.mjs`、`scripts/uninstall.mjs`、`scripts/status.mjs`、`package.json`、`README.md`。
- 安装/卸载会读写用户环境：`~/.config/opencode/opencode.jsonc`（备份后合并/移除 `provider.trae`）、`~/.config/opencode/plugins/trae-bridge.js`、`~/.config/opencode/trae-bridge/`（server.js 与生成的 config.json）。
- 依赖：仅使用 Node 内置模块（安装脚本与转接层零第三方依赖）；Node 已是既有硬性前置依赖。
- 不影响：traecli 调用协议、SSE 翻译逻辑、权限模式推导等既有行为保持不变。
