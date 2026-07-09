## ADDED Requirements

### Requirement: 可分发的项目结构
系统 SHALL 将 Trae Bridge 的全部源文件纳入本仓库并按标准化结构组织，使其可通过 `git clone` 分发，且不依赖任何全局配置目录中的手工文件作为源头。

#### Scenario: 源文件齐备
- **WHEN** 用户克隆仓库
- **THEN** 仓库包含 `config/trae.json`、`src/server.js`、`src/trae-bridge.js`、`scripts/install.mjs`、`scripts/uninstall.mjs`、`scripts/status.mjs`、`scripts/lib/config.mjs`、`package.json` 与 `README.md`

#### Scenario: 零第三方依赖
- **WHEN** 检查安装脚本与转接层源码的依赖
- **THEN** 它们仅使用 Node 内置模块，无需 `npm install` 即可运行

### Requirement: 单一配置源
系统 SHALL 以 `config/trae.json` 作为端口、主机、traecli 路径、默认权限模式、prompt 上限与模型列表的唯一来源，并由它派生转接层运行配置与 opencode provider 配置。

#### Scenario: 配置字段完整
- **WHEN** 读取 `config/trae.json`
- **THEN** 其中包含 `port`、`host`、`traecliPath`、`defaultPermissionMode`、`maxPromptChars` 与 `models`（每个模型含 `id` 与 `name`）

#### Scenario: 模型列表单处维护
- **WHEN** 用户在 `config/trae.json` 中新增或修改模型后重新安装
- **THEN** opencode 的 `provider.trae.models` 与转接层的模型列表同时反映该变更，无需在其它文件重复编辑

### Requirement: 转接层读取安装配置
转接层 SHALL 在启动时优先读取安装目录下的 `config.json`；当该文件缺失或字段缺省时，回退到既有环境变量与内置默认值，且对外的 HTTP 行为保持不变。

#### Scenario: 读取生成的配置
- **WHEN** 安装目录存在 `config.json` 且指定了端口与模型
- **THEN** 转接层按该端口监听，并在 `GET /v1/models` 返回该模型列表

#### Scenario: 缺失配置时回退
- **WHEN** 安装目录不存在 `config.json`
- **THEN** 转接层使用环境变量或内置默认值启动，不报错

### Requirement: 标准化安装流程
系统 SHALL 提供幂等的安装脚本，将转接层、生命周期插件与派生配置部署到 opencode 用户配置目录，并把 `provider.trae` 安全合并进 opencode 配置。

#### Scenario: 部署运行文件
- **WHEN** 用户运行 `node scripts/install.mjs`
- **THEN** `src/server.js` 被复制到 `~/.config/opencode/trae-bridge/server.js`，`src/trae-bridge.js` 被复制到 `~/.config/opencode/plugins/trae-bridge.js`，并在 `~/.config/opencode/trae-bridge/config.json` 写入由 `config/trae.json` 派生的配置

#### Scenario: 合并前备份配置
- **WHEN** 安装脚本即将修改已存在的 opencode 配置文件
- **THEN** 先创建带时间戳的备份副本，再把 `provider.trae` 深合并进配置并写回

#### Scenario: 幂等重装
- **WHEN** 用户重复运行安装脚本
- **THEN** 结果与单次安装一致，不产生重复的 provider 条目或损坏的配置

#### Scenario: 不劫持默认模型
- **WHEN** 用户运行安装脚本
- **THEN** 安装不写入 `model` 字段，opencode 配置中既有的默认模型保持不变

#### Scenario: 插件以 ESM 加载
- **WHEN** 安装脚本部署生命周期插件
- **THEN** 在 `~/.config/opencode/plugins/` 写入最小 `package.json`（`{"type":"module"}`），确保 ESM 插件被正确加载

### Requirement: 标准化卸载流程
系统 SHALL 提供卸载脚本，精确移除安装产物并从 opencode 配置中撤销相关改动，且改动前先备份。

#### Scenario: 移除运行文件
- **WHEN** 用户运行 `node scripts/uninstall.mjs`
- **THEN** `~/.config/opencode/plugins/trae-bridge.js` 与 `~/.config/opencode/trae-bridge/` 目录被删除

#### Scenario: 撤销配置改动
- **WHEN** 卸载脚本处理 opencode 配置
- **THEN** 先创建带时间戳的备份，再移除 `provider.trae`（provider 清空后一并删除），其余用户配置保持不变

### Requirement: 安装状态检查
系统 SHALL 提供状态脚本，报告安装产物是否就位以及转接层是否可用。

#### Scenario: 报告已安装并可用
- **WHEN** 用户在已安装且转接层运行时执行 `node scripts/status.mjs`
- **THEN** 输出显示插件文件、转接层文件、派生配置均存在，且 `GET /v1/models` 探活成功并列出模型

#### Scenario: 报告未安装
- **WHEN** 用户在未安装时执行状态脚本
- **THEN** 输出明确指出缺失的产物，且脚本不崩溃
