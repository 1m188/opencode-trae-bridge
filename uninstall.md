# Trae Bridge 卸载指南（AI 可执行）

本文件面向 AI，描述在不运行 `scripts/uninstall.mjs` 的情况下，如何手动完成 Trae Bridge 的卸载。本指南仅操作安装时产生的部署文件与 opencode 配置项，不引用仓库源文件。

> 卸载是安装的逆过程。若你不确定安装产物有哪些，先阅读同目录下的 `install.md`。

---

## 0. 本文档的抽象级别

本文档描述"做什么"，不引用源文件内部的具体代码行。卸载只需操作部署产物，不需要获取仓库源文件。

---

## 1. 前置条件确认

- opencode 用户配置目录存在（见下）
- 本卸载不会触碰 traecli 本身、不会卸载 Node.js，仅移除 Trae Bridge 的部署产物与 opencode 配置项

### opencode 用户配置目录

| 平台 | 实际展开 |
|------|---------|
| macOS / Linux | `~/.config/opencode` |
| Windows | `C:\Users\<用户名>\.config\opencode` |

下文以 `OPENCODE_DIR` 代指该目录。

---

## 2. 移除插件文件

删除以下文件（若存在；不存在则跳过）：

```
OPENCODE_DIR/plugins/trae-bridge.js
```

---

## 3. 条件清理 plugins/package.json

`OPENCODE_DIR/plugins/package.json` 是安装时为声明 ESM 模块类型而写入的。**不能无脑删除**——用户可能还有其它插件依赖它。按以下规则处理：

### 3.1 判断是否可删除

同时满足以下两个条件才可删除：

1. 文件内容解析为 JSON 后，**仅含一个字段**：`type`，且值为 `"module"`
2. `plugins/` 目录内**已无其它插件**（即除 `package.json` 外没有其它文件）

### 3.2 执行

- 满足条件 → 删除 `OPENCODE_DIR/plugins/package.json`
- 不满足条件（文件含其它字段，或目录内还有其它插件） → **保留**，不做改动

> 这是为了避免破坏用户其它 CommonJS 插件的加载行为。

---

## 4. 移除转接层目录

递归删除整个目录（若存在；不存在则跳过）：

```
OPENCODE_DIR/trae-bridge/
```

该目录包含 `server.js`、`config.json`、`plugin.log` 等安装产物，整体移除即可。

---

## 5. 备份并从 opencode 配置注销 provider

### 5.1 定位 opencode 配置文件

在 `OPENCODE_DIR` 下按以下优先级查找：

1. `opencode.jsonc`（存在则用）
2. `opencode.json`（存在则用）
3. 都不存在 → 无需清理 opencode 配置，跳过第 5 步

### 5.2 备份（关键）

**在修改前**，先完整复制一份备份，命名为 `opencode.jsonc.bak-<时间戳>` 或 `opencode.json.bak-<时间戳>`（时间戳用 ISO 格式，`:` 和 `.` 替换为 `-`）。

> 备份是安全网。opencode 配置可能包含用户其它 provider 设置，直接改写有损坏风险。**未备份前不要写入。**

> 备份保留：历史备份会累积，建议仅保留最近 5 份（按时间戳降序），更早的可清理（与 `scripts/uninstall.mjs` 的 `pruneBackups` 行为一致）。

### 5.3 移除 `provider.trae`

读取配置（若为 `.jsonc`，需去除注释与尾逗号后解析），然后：

1. 若存在 `config.provider.trae`：
   - 删除 `config.provider.trae`
   - 若删除后 `config.provider` 已无任何键，一并删除 `config.provider`（保持配置整洁）
2. 若不存在 `config.provider.trae`：无需改动，跳过写回

### 5.4 写回

仅当第 5.3 步发生了改动时，才把修改后的配置写回原文件。否则保持原样、不要触发无谓的写入。

**写回格式**：统一序列化为标准 JSON（`JSON.stringify` 两空格缩进）——原 `.jsonc` 的注释与原始格式会丢失，这是预期行为（与 `scripts/uninstall.mjs` 一致）。

---

## 6. 重启

**完全退出并重新启动 opencode**，使变更生效。

### 验证检查点

- 运行 `/models`，确认不再出现 `trae/*` 模型 → provider 注销成功
- 确认 `OPENCODE_DIR/trae-bridge/` 目录已不存在
- 确认 `OPENCODE_DIR/plugins/trae-bridge.js` 已不存在

---

## 附：清理范围速查

| 产物 | 位置 | 处理 |
|------|------|------|
| 生命周期插件 | `OPENCODE_DIR/plugins/trae-bridge.js` | 删除 |
| 插件模块声明 | `OPENCODE_DIR/plugins/package.json` | 条件删除（见 §3） |
| 转接层目录 | `OPENCODE_DIR/trae-bridge/` | 整体删除 |
| opencode 配置项 | `OPENCODE_DIR/opencode.jsonc` 或 `.json` 中的 `provider.trae` | 备份后移除 |

> 本指南不触碰 traecli、Node.js、以及 opencode 本体。这些组件的卸载请参考各自文档。
