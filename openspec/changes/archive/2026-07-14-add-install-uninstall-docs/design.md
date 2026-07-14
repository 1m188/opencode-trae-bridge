## Context

本项目目前有一个 README（面向人类用户），以及 `scripts/install.mjs` 和 `scripts/uninstall.mjs` 两个可执行脚本。AI 要想理解安装流程，只能通过阅读脚本源码推断。新增 `install.md` 和 `uninstall.md` 的目的，是为 AI 提供一份不依赖脚本源码的流程文档。

## Goals / Non-Goals

**Goals:**
- 提供 `install.md` 和 `uninstall.md`，让 AI 在不 clone 仓库、不阅读脚本源码的情况下理解安装和卸载流程
- 两份文档使用相对路径引用源文件，AI 可从文档自身 URL 推导仓库根路径
- 两份文档使用抽象描述（"做什么"），不引用脚本内部的具体代码行，对源文件改动有高容忍度

**Non-Goals:**
- 不修改 `scripts/install.mjs` / `scripts/uninstall.mjs` 的行为
- 不在文档中内联源文件内容
- 不让文档成为脚本的 AST 级精确等价物 — 文档描述流程意图，脚本是实现细节

## Decisions

### 文档放置位置：仓库根目录

两文件置于仓库根路径下（与 `README.md` 同级）。根目录是 AI 快速扫描本仓库结构的常见入口，且方便与 README 互为补充。

### 相对路径引用源文件

文档中引用 `src/server.js`、`src/trae-bridge.js`、`config/config.mjs` 等均使用相对于仓库根目录的路径。AI 获取 `install.md` 时已知该文档的 URL（如 `https://raw.githubusercontent.com/user/repo/main/install.md`），可据此拼出其他源文件的完整下载地址。不硬编码 GitHub raw URL，避免分支名或仓库迁移后失效。

### 抽象描述 vs. 具体步骤

文档采用"将文件 A 的完整内容写入位置 B"级别的描述，不引用"找到 A 文件中的第 n 行 import"之类的内容。这样当 `server.js` 或 `trae-bridge.js` 内部重构时，文档无需修改。

对于配置生成步骤（构造 `config.json` 和 opencode 的 `provider.trae`），文档给出结构骨架与字段含义，指向 `config/config.mjs` 作为 port、host、models 等字段值的权威来源，但不复制其实现逻辑。注意分工：`provider.trae` 与 bridge `config.json` 的结构骨架由文档自带（便于 AI 直接构造），而把配置对象组装起来的逻辑（`deriveProvider` / `deriveBridgeConfig`，位于 `scripts/lib/config.mjs`）不写入文档——AI 按骨架手动填值即可，无需复刻脚本内部函数。

## Risks / Trade-offs

- [Risk] 文档与脚本输出可能产生偏差（文档没有脚本精确）→ 文档作为补充而非替代，README 仍然指向脚本安装。文档定位是让 AI "理解流程并手动执行"。
- [Risk] AI 可能误解抽象描述并做出错误操作 → 每个关键步骤附带可验证的检查点（如"重启后运行 /models 确认出现 trae/* 模型"）。
