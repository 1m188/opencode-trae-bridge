## ADDED Requirements

### Requirement: 安装文档存在且可 AI 读取
系统 SHALL 在仓库根目录提供 `install.md`，使 AI 在无需 clone 仓库或阅读脚本源码的情况下即可理解安装流程。

#### Scenario: install.md 位于仓库根目录
- **WHEN** AI 获取本仓库的文件列表
- **THEN** 仓库根目录下存在 `install.md` 文件

#### Scenario: install.md 覆盖完整安装流程
- **WHEN** AI 阅读 `install.md`
- **THEN** 该文档描述从获取源文件到完成安装并重启 opencode 的全部步骤，包括：前置条件确认（含 traecli 已安装并登录、平台差异说明）、模型发现、文件部署（含 `server.js`、`trae-bridge.js` 插件、`plugins/package.json` 模块声明）、配置生成、备份 opencode 配置、provider 注册等环节

### Requirement: 卸载文档存在且可 AI 读取
系统 SHALL 在仓库根目录提供 `uninstall.md`，使 AI 在无需 clone 仓库或阅读脚本源码的情况下即可理解卸载流程。

#### Scenario: uninstall.md 位于仓库根目录
- **WHEN** AI 获取本仓库的文件列表
- **THEN** 仓库根目录下存在 `uninstall.md` 文件

#### Scenario: uninstall.md 覆盖完整卸载流程
- **WHEN** AI 阅读 `uninstall.md`
- **THEN** 该文档描述从删除部署文件到清理 opencode 配置并重启的全部步骤，包括：插件文件移除、`plugins/package.json` 条件清理、bridge 目录清理、备份 opencode 配置、provider 注销等环节

### Requirement: 安装文档使用相对路径引用源文件
`install.md` 中引用本仓库源文件时 SHALL 使用相对于仓库根目录的路径，以便 AI 从文档自身的 URL 推导出源文件的完整下载地址。`uninstall.md` 仅操作部署产物、无需引用仓库源文件，不受此约束。

#### Scenario: 不硬编码绝对 URL
- **WHEN** AI 阅读 `install.md`
- **THEN** 文档中不存在 `https://raw.githubusercontent.com` 或类似形式的硬编码下载链接

#### Scenario: 相对路径可反推
- **WHEN** AI 已知 `install.md` 的获取地址（如某 GitHub raw URL）
- **THEN** AI 可依据文档中给出的相对路径（如 `src/server.js`）拼出对应文件在仓库中的地址

### Requirement: 文档使用抽象描述而非具体代码引用
`install.md` 和 `uninstall.md` 中描述操作步骤时 SHALL 使用"做什么"层面的抽象描述（如"将文件 A 完整复制到位置 B"），不得引用源文件内部的具体代码行或片段。

#### Scenario: 不引用文件内部行号或代码片段
- **WHEN** 源文件 `src/server.js` 发生内部重构（逻辑等价但行号变化）
- **THEN** AI 仍然可以仅凭 `install.md` 完成安装，无需更新文档

#### Scenario: 配置结构自带骨架、字段值指向权威来源
- **WHEN** AI 需要构造 bridge 配置或 provider 配置
- **THEN** 文档自带 `provider.trae` 与 bridge `config.json` 的结构骨架（字段名与层级），并指向 `config/config.mjs` 作为 port、host、models 等字段默认值的权威来源，但不逐字段复制实现逻辑，也不复刻 `scripts/lib/config.mjs` 中 `deriveProvider` / `deriveBridgeConfig` 的组装逻辑

### Requirement: 文档覆盖平台差异
`install.md` SHALL 说明在不同操作系统（Windows / macOS / Linux）下 traecli 的探测路径、opencode 配置目录位置等平台相关差异，使 AI 能在任意平台完成安装。

#### Scenario: traecli 探测路径按平台说明
- **WHEN** AI 在 Windows 或 Unix 环境执行安装
- **THEN** `install.md` 给出对应平台的 traecli 可执行文件候选位置（如 Windows 的 `%LOCALAPPDATA%\trae-cli\bin\traecli.exe`、Unix 的 `~/.local/bin/traecli` 等）

#### Scenario: opencode 配置目录按平台说明
- **WHEN** AI 需要定位 opencode 用户配置目录
- **THEN** `install.md` 说明该目录统一为 `~/.config/opencode`，并指出在 Windows 下展开为 `C:\Users\<用户>\.config\opencode`
