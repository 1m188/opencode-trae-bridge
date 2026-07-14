## Why

当前项目的安装与卸载依赖 `scripts/install.mjs` 和 `scripts/uninstall.mjs` 两个可执行脚本。对 AI 而言，理解安装流程的唯一方式是 clone 整个仓库并阅读脚本源码。我们希望提供一份 AI 友好的文档，让 AI 无需下载整个项目即可理解如何安装和卸载，并在需要时直接执行这些操作。

## What Changes

- 在仓库根目录新增 `install.md`，描述在不运行脚本的情况下如何安装项目
- 在仓库根目录新增 `uninstall.md`，描述在不运行脚本的情况下如何卸载项目
- 两个文档使用相对路径引用源文件，AI 可从文档自身的 URL 反推文件地址
- 两个文档使用抽象描述（如"将文件 A 完整复制到位置 B"），而非引用文件内部的具体代码行，确保源文件修改后文档仍然有效

## Capabilities

### New Capabilities
- `install-uninstall-docs`: 面向 AI 的安装与卸载文档，描述安装流程的"做什么"而非"怎么做"，使用相对路径和抽象步骤，与 `scripts/install.mjs` / `scripts/uninstall.mjs` 的具体实现解耦

### Modified Capabilities
<!-- 纯文档增加，不影响任何既有 spec 的需求 -->

## Impact

- 受影响文件：仓库根目录新增 `install.md` 和 `uninstall.md`
- 不影响任何既有代码、脚本或配置
- 不引入新依赖
