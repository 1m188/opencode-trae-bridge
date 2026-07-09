## Context

Trae Bridge 已经能工作：转接层 `server.js` 将 traecli 包装为本地 OpenAI 兼容服务，生命周期插件在 opencode 启动时拉起、退出时关闭它，opencode `provider.trae` 让 Trae 模型可选。但这些文件目前只存在于用户全局配置目录 `~/.config/opencode/`，靠手工放置，无法分发，也不便迭代重装与回滚。

关键约束（来自 opencode 官方插件文档与本机环境）：
- 本地插件从 `~/.config/opencode/plugins/`（全局）或 `<project>/.opencode/plugins/`（项目级）自动加载，须为 ESM。
- opencode 的 provider 只能写在配置文件（`opencode.json`/`.jsonc`）里；没有可在插件中动态注册 provider 的钩子。因此安装脚本必须直接编辑用户配置文件。
- 用户配置为 JSONC（含注释与尾逗号），是需要保护的用户资产。
- Node 已是硬性前置依赖（转接层就跑在 Node 上），可作为跨平台安装脚本的公共基础。
- 本仓库 `.gitignore` 忽略 `/.opencode/`，故分发源码放在 `src/`、`scripts/`、`config/`，不放 `.opencode/`。

## Goals / Non-Goals

**Goals:**
- 把运行文件收回仓库作为唯一源头，形成可 `git clone` 分发的标准结构。
- 单一配置源 `config/trae.json` 同时驱动转接层与 opencode provider。
- 提供幂等、带备份、可回滚的安装/卸载/状态脚本，全部零第三方依赖。
- 安装默认不修改用户既有默认模型，避免分发时劫持他人配置。
**Non-Goals:**
- 不发布到 npm、不提供 `npx`（本次仅 git clone + node 脚本）。
- 不改变转接层既有对外行为（traecli 调用、SSE 翻译、权限模式推导保持不变）。
- 不引入命令映射、有状态会话复用或 traecli 文件改动追踪。

## Decisions

### 决策 1：用 Node ESM 脚本做安装器，而非 PowerShell
- **选择**：`scripts/*.mjs`，仅用 `fs`/`path`/`os`/`http` 等内置模块。
- **理由**：Node 已是前置依赖；单一实现即可跨平台，避免 PowerShell/Bash 双份维护。
- **备选**：仅 PowerShell 脚本——被否，绑死 Windows 且与"可分发"目标冲突。

### 决策 2：单一配置源 `config/trae.json` 派生两份产物
- **选择**：`config/trae.json` → 安装时派生 (a) `~/.config/opencode/trae-bridge/config.json` 供转接层读取；(b) opencode 配置里的 `provider.trae`（含由 models 生成的 baseURL 与 models 映射）。
- **理由**：消除模型列表两处重复；分发给他人只需改一个文件。
- **备选**：继续在 server.js 与 provider 两处硬编码——被否，易漂移。

### 决策 3：server.js 优先读 config.json，回退 env/默认值
- **选择**：启动时若同目录存在 `config.json` 则读取覆盖默认；否则保持现有 env/内置默认。
- **理由**：向后兼容，未安装场景（直接 node 运行）仍可用；行为对外不变。
- **备选**：强制要求 config.json——被否，降低鲁棒性。

### 决策 4：opencode 配置采用"备份 + 深合并"，容忍 JSONC
- **选择**：修改前写带时间戳的备份（如 `opencode.jsonc.bak-<timestamp>`）；用容忍注释/尾逗号的解析读入，仅深合并/删除 `provider.trae` 后写回；备份仅保留最近若干份（`pruneBackups`）。
- **理由**：保护用户资产、可回滚；深合并保证幂等且不动无关配置。
- **权衡**：写回为标准 JSON 会丢失原文件注释——通过备份留存原件缓解，并在 README 说明。
- **备选**：只输出片段让用户手工粘贴——用户已明确要自动合并，否。

### 决策 5：绝不改写用户默认模型
- **选择**：安装仅新增 `provider.trae`，不写 `model` 字段；用户在 opencode TUI 中用 `/models` 自行选择。`$schema` 仅在新建配置时补上，既有配置保留其原值，不强加。
- **理由**：分发给他人时不劫持其默认模型；如何选模型是用户的事，插件只负责让模型可用。
- **备选**：提供 `--set-default` 开关——被否，即便可选也引入了"脚本会动 model 字段"的语义与维护面，与"只加模型、不碰选择"目标冲突。

### 决策 6：卸载精确撤销、同样先备份
- **选择**：删插件文件与 `trae-bridge/` 目录；从配置移除 `provider.trae`（provider 清空后一并删除）；写回前备份并清理旧备份。安装写入的 `plugins/package.json`（仅 `{"type":"module"}`）在目录内无其它插件时一并清理。
- **理由**：干净回滚，便于反复测试。

## Risks / Trade-offs

- [写回 JSON 丢失 opencode.jsonc 注释] → 每次改动前时间戳备份，README 提示用户可从备份恢复注释。
- [定位 opencode 配置文件失败或存在多个候选（.json 与 .jsonc）] → 按优先级探测（`.jsonc` 优先，其次 `.json`），找不到则创建最小 `.jsonc`；日志打印实际命中的路径。
- [JSONC 解析器需自研（零依赖约束）] → 仅需去注释/尾逗号的轻量解析，覆盖常见形态；解析失败时中止并提示手工处理，不破坏原文件。
- [安装覆盖用户手工放置的旧全局文件] → 属预期（覆盖式部署统一为仓库源头）；备份保障可回滚。
- [端口占用] → 启动时 `GET /v1/models` 探活确认占用者是否为本 bridge：是则复用退出，否则报错退出，避免静默挂到无关进程。
- [子进程孤儿/卡死] → 每次调用设超时（默认 10 分钟）并在客户端断开、异常、完成时统一 `kill` 子进程。
- [插件为 ESM 但 plugins/ 目录默认按 CommonJS 解析 .js] → 安装时向 `plugins/` 写入最小 `package.json`（`{"type":"module"}`）声明模块类型，卸载时按需清理。

## Migration Plan

1. 从全局目录把当前 `server.js`、`trae-bridge.js` 内容搬回仓库 `src/`，抽出配置到 `config/trae.json`。
2. 实现 `scripts/lib/config.mjs` 与三个脚本。
3. 本地验证：`node scripts/install.mjs` → 重启 opencode → `/models` 出现 `trae/*` → `node scripts/status.mjs` 探活 → `node scripts/uninstall.mjs` 回滚。
4. 回滚策略：卸载脚本 + 时间戳备份可完整还原 opencode 配置与运行文件。

## Open Questions

- 无阻塞项。README 的"已知限制"章节将记录未处理的隐疾，供后续 change 跟进。
