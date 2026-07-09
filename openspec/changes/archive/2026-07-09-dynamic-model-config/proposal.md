## Why

当前模型列表硬编码在 `config/trae.json` 里，Trae 平台新增或下线模型后，本地列表会过期，需要手工同步。应改为在每次安装时实时从 `traecli models` 获取，保证列表始终与 Trae 平台一致。同时把静态 JSON 配置源升级为可执行的 `config/config.mjs`，让常量集中定义、动态项自带获取逻辑。

## What Changes

- **BREAKING**：删除 `config/trae.json`，改用 `config/config.mjs` 作为唯一配置源。常量（`port`、`host`、`traecliPath`、`defaultPermissionMode`、`maxPromptChars`）直接定义，模型列表通过逻辑实时获取。
- 新增 `config/config.mjs`，导出 `resolveConfig()`：汇总常量并 `await resolveModels()` 实时拉取模型列表，返回完整配置对象。
- 新增 `resolveModels()`：spawn `traecli models`，读取 stdout 按行解析为模型 ID，生成 `{ id, name: "<id> (Trae)" }`。
- `scripts/install.mjs` 改为 `import` 并 `await resolveConfig()`；拉取失败（未登录 / 找不到 traecli / 输出为空）时打印清晰错误并中止安装（`exit(1)`）。
- `scripts/lib/config.mjs`：移除 `readTraeConfig()`，抽出可复用的 `resolveTraecli()` 供配置脚本定位可执行文件；`deriveProvider` / `deriveBridgeConfig` 保持消费同形状配置对象。

## Capabilities

### New Capabilities
<!-- 无新增能力，本次为对既有安装器能力的修改 -->

### Modified Capabilities
- `trae-bridge-installer`: 配置源从静态 `config/trae.json` 改为可执行的 `config/config.mjs`；模型列表由安装时实时执行 `traecli models` 获取，而非硬编码；拉取失败时中止安装。

## Impact

- 新增文件：`config/config.mjs`。
- 删除文件：`config/trae.json`。
- 修改文件：`scripts/install.mjs`、`scripts/lib/config.mjs`、`README.md`。
- 不受影响：`scripts/status.mjs`、`scripts/uninstall.mjs`（读取部署后的 `config.json`，不读源配置）；`src/server.js` 的运行时行为不变（仍读部署生成的 `config.json`）。
- 前置依赖：安装机器须已安装并登录 `traecli`，否则安装中止。
