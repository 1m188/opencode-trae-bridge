## Requirements

### Requirement: 可分发的项目结构
系统 SHALL 将 Trae Bridge 的全部源文件纳入本仓库并按标准化结构组织，使其可通过 `git clone` 分发，且不依赖任何全局配置目录中的手工文件作为源头。

#### Scenario: 源文件齐备
- **WHEN** 用户克隆仓库
- **THEN** 仓库包含 `config/config.mjs`、`src/server.js`、`src/trae-bridge.js`、`scripts/install.mjs`、`scripts/uninstall.mjs`、`scripts/status.mjs`、`scripts/lib/config.mjs`、`package.json` 与 `README.md`

#### Scenario: 不含静态模型配置文件
- **WHEN** 用户克隆仓库
- **THEN** 仓库不包含 `config/trae.json`，配置由可执行的 `config/config.mjs` 提供

#### Scenario: 零第三方依赖
- **WHEN** 检查安装脚本与转接层源码的依赖
- **THEN** 它们仅使用 Node 内置模块，无需 `npm install` 即可运行

### Requirement: 单一配置源
系统 SHALL 以可执行的 `config/config.mjs` 作为端口、主机、traecli 路径、默认权限模式、prompt 上限与模型列表的唯一来源，并由它派生转接层运行配置与 opencode provider 配置。其中常量项直接定义，模型列表在安装时通过执行 `traecli models` 实时获取，而非硬编码。

#### Scenario: 常量字段完整
- **WHEN** 调用 `config/config.mjs` 的 `resolveConfig()`
- **THEN** 返回的配置对象包含 `port`、`host`、`traecliPath`、`defaultPermissionMode`、`maxPromptChars` 与 `models`（每个模型含 `id` 与 `name`）

#### Scenario: 模型列表实时获取
- **WHEN** 安装时 `resolveConfig()` 解析模型列表
- **THEN** 系统执行 `traecli models`，按行解析 stdout 得到模型 ID，并为每个 ID 生成 `{ id, name: "<id> (Trae)" }`，使列表与 Trae 平台当前可用模型一致

#### Scenario: 模型列表随平台更新
- **WHEN** Trae 平台新增或下线模型后用户重新安装
- **THEN** opencode 的 `provider.trae.models` 与转接层的模型列表同时反映 `traecli models` 的最新输出，无需手工编辑任何文件

#### Scenario: 模型获取失败时中止安装
- **WHEN** 安装时 `traecli models` 执行失败（未登录、找不到 traecli 或输出为空）
- **THEN** 安装脚本打印清晰错误并以非零状态码退出，不写入任何配置或部署文件

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
- **THEN** `src/server.js` 被复制到 `~/.config/opencode/trae-bridge/server.js`，`src/trae-bridge.js` 被复制到 `~/.config/opencode/plugins/trae-bridge.js`，并在 `~/.config/opencode/trae-bridge/config.json` 写入由 `config/config.mjs` 的 `resolveConfig()` 派生的配置

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

### Requirement: 派生 provider 启用思考内容渲染

安装脚本在派生 opencode `provider.trae` 时，SHALL 为每个模型加入 `reasoning: true` 与 `interleaved: { field: "reasoning_content" }`，使 opencode 将转接层输出的思考内容渲染为独立思考块，并在多轮对话中保留思考上下文。其中 `reasoning: true` 是渲染思考块的必要开关（自定义 provider 默认为 `false`，不设则思考块不显示）；`interleaved` 指定跨轮保留思考所用的字段名。

#### Scenario: 模型配置含 reasoning 与 interleaved 字段

- **WHEN** 用户运行 `node scripts/install.mjs` 派生 `provider.trae`
- **THEN** 写入 opencode 配置的每个 `provider.trae.models.<id>` 均含 `reasoning: true` 与 `interleaved: { field: "reasoning_content" }`

#### Scenario: 思考块正确渲染

- **WHEN** 用户在 opencode 中使用已配置的 trae 模型对话，且转接层输出 `reasoning_content`
- **THEN** opencode 将思考内容渲染为独立思考块，而非丢弃或混入正文

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
