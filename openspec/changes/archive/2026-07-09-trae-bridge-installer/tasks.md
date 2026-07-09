## 1. 仓库结构与配置源

- [x] 1.1 创建目录结构 `src/`、`scripts/`、`scripts/lib/`、`config/`
- [x] 1.2 编写 `config/trae.json` 单一配置源（`port`、`host`、`traecliPath`、`defaultPermissionMode`、`maxPromptChars`、`models[{id,name}]`）
- [x] 1.3 编写 `package.json`（元数据 + scripts：`install`/`uninstall`/`status`，type module；因 npm 生命周期保留名改用 `install-bridge`/`uninstall-bridge`/`status`）

## 2. 搬迁并改造运行文件

- [x] 2.1 将全局目录的 `server.js` 内容搬回 `src/server.js`
- [x] 2.2 改造 `src/server.js`：启动时优先读同目录 `config.json`，缺失字段回退 env/内置默认；端口、模型、traecli 路径、权限模式、prompt 上限均可被配置覆盖
- [x] 2.3 将全局目录的插件搬回 `src/trae-bridge.js`（ESM），从安装目录 `config.json` 读取端口/server 路径
- [x] 2.4 校验两个文件语法（`node --check`），确认对外行为未变

## 3. 安装器公共库

- [x] 3.1 `scripts/lib/config.mjs`：读取并校验 `config/trae.json`
- [x] 3.2 `scripts/lib/config.mjs`：定位 opencode 用户配置（`.jsonc` 优先，其次 `.json`，均无则创建最小 `.jsonc`），返回命中路径
- [x] 3.3 `scripts/lib/config.mjs`：零依赖 JSONC 解析（去注释/尾逗号），解析失败时安全中止不破坏原文件
- [x] 3.4 `scripts/lib/config.mjs`：由 `trae.json` 派生 `provider.trae`（baseURL、models 映射）与转接层 `config.json`
- [x] 3.5 `scripts/lib/config.mjs`：时间戳备份工具、深合并工具、解析各目标路径（plugins/、trae-bridge/）

## 4. 安装脚本

- [x] 4.1 `scripts/install.mjs`：复制 `src/server.js` → `~/.config/opencode/trae-bridge/server.js`
- [x] 4.2 生成 `~/.config/opencode/trae-bridge/config.json`（由 `trae.json` 派生）
- [x] 4.3 复制 `src/trae-bridge.js` → `~/.config/opencode/plugins/trae-bridge.js`
- [x] 4.4 备份后深合并 `provider.trae` 进 opencode 配置并写回（幂等，不产生重复条目）
- [x] 4.5 安装不写 `model` 字段，保持用户默认模型不变；向 `plugins/` 写入 `package.json`（`{"type":"module"}`）确保插件以 ESM 加载
- [x] 4.6 打印后续步骤（重启 opencode → `/models` 验证）

## 5. 卸载与状态脚本

- [x] 5.1 `scripts/uninstall.mjs`：删除插件文件与 `~/.config/opencode/trae-bridge/` 目录
- [x] 5.2 `scripts/uninstall.mjs`：备份后从 opencode 配置移除 `provider.trae`（provider 清空后一并删除）；清理安装写入的 `plugins/package.json`
- [x] 5.3 `scripts/status.mjs`：检查插件文件、server 文件、派生 config.json 是否存在
- [x] 5.4 `scripts/status.mjs`：对 `GET /v1/models` 探活并列出模型；未安装时给出清晰缺失提示且不崩溃

## 6. 文档

- [x] 6.1 编写中文 `README.md`：安装（git clone → node scripts/install.mjs）、卸载、状态检查
- [x] 6.2 README 记录 `config/trae.json` 各字段说明；说明安装不改写默认模型
- [x] 6.3 README 增加"已知限制"章节（JSONC 注释丢失/备份恢复、孤儿进程等待后续处理）

## 7. 端到端验证

- [x] 7.1 运行 `node scripts/install.mjs`，确认三处产物就位且 opencode 配置已备份+合并
- [x] 7.2 重启 opencode，`/models` 出现 `trae/*` 模型并可正常对话
- [x] 7.3 运行 `node scripts/status.mjs` 探活成功
- [x] 7.4 运行 `node scripts/uninstall.mjs`，确认产物清除且配置还原
- [x] 7.5 二次运行安装脚本验证幂等（无重复 provider、配置未损坏）
