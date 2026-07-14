# Trae Bridge 安装指南（AI 可执行）

本文件面向 AI，描述在不运行 `scripts/install.mjs` 的情况下，如何手动完成 Trae Bridge 的安装。文档使用相对路径引用仓库源文件——你可通过本文件的获取地址（如某 GitHub raw URL）拼出下文每个相对路径对应的完整下载地址。

---

## 0. 本文档的抽象级别

本文档描述"做什么"，不引用源文件内部的具体代码行。当源文件发生内部重构（行号变化、函数改名）时，本指南仍然有效。配置对象的结构骨架由本文件自带；字段默认值请以 `config/config.mjs` 为权威来源。

---

## 1. 前置条件确认

在开始前，确认以下条件成立：

### 1.1 Node.js 已安装

安装过程与 opencode 运行时都需要 Node.js（>= 18）。确认 `node --version` 可正常输出且版本不低于 18。

### 1.2 traecli 已安装并已登录

本安装需要实时执行 `traecli models` 获取模型列表。请确认：

- `traecli` 可执行文件已安装
- 已完成登录（否则 `traecli models` 会失败）

**traecli 探测路径**（按平台）：traecli 的可执行文件按以下候选位置探测，确认其中之一存在该文件：

| 平台 | 候选路径 |
|------|---------|
| Windows | `%LOCALAPPDATA%\trae-cli\bin\traecli.exe` |
| Windows（回退） | `%APPDATA%\trae-cli\bin\traecli.exe` |
| Windows（回退） | `%USERPROFILE%\.trae-cli\bin\traecli.exe` |
| macOS / Linux | `~/.local/bin/traecli` |
| macOS / Linux（回退） | `~/.trae-cli/bin/traecli` |
| macOS / Linux（回退） | `/usr/local/bin/traecli` |
| macOS / Linux（回退） | `/opt/homebrew/bin/traecli` |
| macOS / Linux（回退） | `/usr/bin/traecli` |

也可通过环境变量 `TRAECLI_PATH` 显式指定 traecli 的完整路径。

若以上候选位置均未找到 traecli，回退到系统 `PATH` 上的命令名（Windows 为 `traecli.exe`，Unix 为 `traecli`），交由系统解析——即 traecli 可能不在候选路径、但已在 PATH 中，仍可正常工作。

### 1.3 opencode 用户配置目录

opencode 的用户配置目录统一为 `~/.config/opencode`：

| 平台 | 实际展开 |
|------|---------|
| macOS / Linux | `~/.config/opencode` |
| Windows | `C:\Users\<用户名>\.config\opencode` |

下文以 `OPENCODE_DIR` 代指该目录。

### 1.4 验证模型发现

执行一次 `traecli models`，确认它能输出模型 ID 列表（每行一个，由字母、数字与 `.` `_` `/` `+` `-` 组成）。该列表将用于后续配置生成。若输出为空或报错，说明 traecli 未安装或未登录，请先解决再继续。

---

## 2. 获取源文件

从仓库获取以下两个源文件（路径相对于仓库根目录），完整下载到本地临时位置：

| 源文件（相对路径） | 用途 |
|-------------------|------|
| `src/server.js` | 转接层（HTTP 服务，桥接 opencode 与 traecli） |
| `src/trae-bridge.js` | opencode 生命周期插件（启动/退出时拉起/关闭转接层） |

> 拼地址方法：若本文件获取地址为 `<root>/install.md`，则 `src/server.js` 的地址为 `<root>/src/server.js`。

---

## 3. 部署文件

### 3.1 部署转接层

将 `src/server.js` 完整复制到：

```
OPENCODE_DIR/trae-bridge/server.js
```

若 `trae-bridge/` 目录不存在，先创建它。

### 3.2 部署生命周期插件

将 `src/trae-bridge.js` 完整复制到：

```
OPENCODE_DIR/plugins/trae-bridge.js
```

若 `plugins/` 目录不存在，先创建它。

### 3.3 写入插件模块声明

插件使用 ESM 语法（`import`/`export`），而 `plugins/` 目录默认无 `package.json`，Node 会按 CommonJS 解析 `.js`。必须在以下位置写入一个最小的 `package.json`：

```
OPENCODE_DIR/plugins/package.json
```

内容骨架：

```json
{
  "type": "module"
}
```

**处理规则**：
- 若该文件**不存在**，直接写入 `{"type":"module"}`
- 若该文件**已存在**且 `type` 字段已是 `"module"`，无需改动
- 若该文件**已存在**但 `type` 不是 `"module"`（或没有 `type` 字段）：**不要覆盖**。插件为 ESM，可能无法加载，需人工确认。此情况意味着用户有其它插件配置，强行覆盖会破坏既有插件。

---

## 4. 生成转接层配置

在以下位置生成 bridge 配置文件：

```
OPENCODE_DIR/trae-bridge/config.json
```

### 4.1 结构骨架

```json
{
  "port": <number>,
  "host": "<string>",
  "traecliPath": "<string>",
  "defaultPermissionMode": "<string>",
  "maxPromptChars": <number>,
  "models": [
    { "id": "<string>", "name": "<string>" }
  ]
}
```

### 4.2 字段值来源

各字段的**默认值与含义**以 `config/config.mjs` 为权威来源。下表给出取值规则：

| 字段 | 取值规则 |
|------|---------|
| `port` | 转接层监听端口，见 `config/config.mjs` |
| `host` | 监听地址（仅回环），见 `config/config.mjs` |
| `traecliPath` | traecli 显式路径，通常为空字符串（自动探测），见 `config/config.mjs` |
| `defaultPermissionMode` | 权限模式信号不明确时的默认值，见 `config/config.mjs` |
| `maxPromptChars` | prompt 作为命令行参数的字符上限，见 `config/config.mjs` |
| `models` | 执行 `traecli models` 实时获取的模型列表，每个 ID 映射为 `{"id": "<id>", "name": "<id> (Trae)"}` |

> 不需要复刻 `scripts/lib/config.mjs` 中 `deriveBridgeConfig` 的组装逻辑——按上表填值即可。

---

## 5. 备份并注册 provider 到 opencode 配置

### 5.1 定位 opencode 配置文件

在 `OPENCODE_DIR` 下按以下优先级查找：

1. `opencode.jsonc`（存在则用）
2. `opencode.json`（存在则用）
3. 都不存在 → 将要新建 `opencode.jsonc`

### 5.2 备份（关键）

**若配置文件已存在**：在修改前，先完整复制一份备份，命名为 `opencode.jsonc.bak-<时间戳>` 或 `opencode.json.bak-<时间戳>`（时间戳用 ISO 格式，`:` 和 `.` 替换为 `-`）。

> 备份是安全网。opencode 配置可能包含用户其它 provider 设置，直接改写有损坏风险。**未备份前不要写入。**

> 备份保留：历史备份会累积，建议仅保留最近 5 份（按时间戳降序），更早的可清理（与 `scripts/install.mjs` 的 `pruneBackups` 行为一致）。

### 5.3 合并 `provider.trae`

将以下结构合并进 opencode 配置（若已有 `provider.trae`，先移除旧的再写入新的，避免残留旧模型条目）：

```json
{
  "provider": {
    "trae": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Trae (企业版)",
      "options": {
        "baseURL": "http://<host>:<port>/v1"
      },
      "models": {
        "<模型ID>": {
          "name": "<模型ID> (Trae)",
          "reasoning": true,
          "interleaved": { "field": "reasoning_content" }
        }
      }
    }
  }
}
```

**字段说明**：
- `baseURL` 中的 `<host>`、`<port>` 与第 4 步生成的 `config.json` 保持一致
- `models` 的键为模型 ID，每个模型对象如上结构
- ⚠️ 注意 `models` 结构差异：此处 `provider.trae.models` 是**对象**（键为模型 ID，值为含 `reasoning`/`interleaved` 的模型对象）；而第 4 步 bridge `config.json` 的 `models` 是**数组**（`[{id, name}]`）。两者同名但结构不同，勿混淆。
- `reasoning: true` 让 opencode 把 SSE 的 `reasoning_content` 渲染为思考块
- `interleaved.field` 指定思考字段名，保证多轮对话中思考上下文正确保留

**合并规则**：深合并（同结构对象按字段递归合并，源覆盖目标），不要整体替换整个配置——只合并 `provider.trae` 这一分支。

**读写格式**：读取配置时，若为 `.jsonc` 需先去除注释与尾逗号后解析（与 `.json` 区别对待）。写回时统一序列化为标准 JSON（`JSON.stringify` 两空格缩进）——原 `.jsonc` 的注释与原始格式会丢失，这是预期行为（与 `scripts/install.mjs` 一致）。

### 5.4 新建配置的补丁

若配置文件是**本次新建**（第 5.1 步情况 3），补上 `$schema` 字段以启用编辑器校验：

```json
{
  "$schema": "https://opencode.ai/config.json"
}
```

若配置**已存在**，保留其原 `$schema` 值，不强加。

### 5.5 中途失败的处理

本安装为多步手动流程，无事务性。若某步失败无法继续，可参考 `uninstall.md` 回滚已部署的内容（已复制的文件、已写入的配置等），使环境回到安装前状态后再重试。

---

## 6. 重启与验证

1. **完全退出并重新启动 opencode**（不是 reload，需重启才能加载插件与 provider）
2. 运行 `/models`，确认出现 `trae/*` 模型
3. 选择某个 `trae` 模型开始对话

### 验证检查点

- `/models` 列表里出现 `trae/` 前缀的模型 → provider 注册成功
- 选模型后能正常对话 → 转接层与 traecli 链路通

若 `/models` 里看不到 trae 模型，按以下顺序排查：

1. `OPENCODE_DIR/trae-bridge/config.json` 是否存在且字段完整
2. `OPENCODE_DIR/plugins/trae-bridge.js` 是否存在
3. `OPENCODE_DIR/plugins/package.json` 的 `type` 是否为 `"module"`
4. opencode 配置里 `provider.trae` 是否存在、`models` 是否非空
5. 查看 `OPENCODE_DIR/trae-bridge/plugin.log`（插件启动失败会写此处）

---

## 附：平台差异速查

| 项 | Windows | macOS / Linux |
|----|---------|---------------|
| opencode 配置目录 | `C:\Users\<用户名>\.config\opencode` | `~/.config/opencode` |
| traecli 可执行名 | `traecli.exe` | `traecli` |
| traecli 首选路径 | `%LOCALAPPDATA%\trae-cli\bin\` | `~/.local/bin/` |
| node 可执行名 | `node.exe` | `node` |
| 路径分隔符 | `\` | `/` |
