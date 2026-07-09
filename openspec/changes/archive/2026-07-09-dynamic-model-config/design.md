## Context

现状：`config/trae.json` 是静态配置源，`scripts/lib/config.mjs` 的 `readTraeConfig()` 读取并校验它，再由 `deriveProvider()` / `deriveBridgeConfig()` 派生出 opencode 的 `provider.trae` 与转接层的 `config.json`。模型列表硬编码在 JSON 的 `models` 数组里，Trae 平台模型更新后会漂移，需手工同步。

已实测确认：`traecli models` 将可用模型 ID 逐行输出到 stdout（每行一个 ID），登录/INFO 日志走 stderr，两者天然分离，便于解析。`traecli` 可执行文件的定位逻辑已存在于 `src/server.js` 的 `resolveTraecli()`（env `TRAECLI_PATH` → 配置 `traecliPath` → 平台候选路径 → PATH 回退）。

## Goals / Non-Goals

**Goals:**
- 用可执行的 `config/config.mjs` 取代静态 `config/trae.json`，常量直接定义、动态项写逻辑。
- 模型列表在每次安装时通过 `traecli models` 实时获取，与 Trae 平台保持一致。
- 保持下游 `deriveProvider` / `deriveBridgeConfig` 消费的配置对象形状不变，收敛改造面。
- 模型获取失败时中止安装并给出清晰错误。

**Non-Goals:**
- 不改变转接层运行时行为：`src/server.js` 仍读取部署生成的 `config.json`，内置默认模型兜底保留。
- 不改变 `status.mjs` / `uninstall.mjs`（它们读取部署产物或 opencode 配置，不读源配置）。
- 不引入运行时的模型热更新（模型列表仅在安装时刷新，符合现有"改配置需重装"的模型）。
- 不为模型生成除 `"<id> (Trae)"` 之外的友好显示名。

## Decisions

**决策 1：配置源用 ESM 模块 `config/config.mjs`，install 直接 import 并 await。**
- 选择：`config/config.mjs` 导出常量与 `async resolveConfig()`；`install.mjs` 直接 `import { resolveConfig }` 并 `await`，仍是单命令 `node scripts/install.mjs`，无中间产物文件。
- 理由：配置从"数据"升级为"能自我计算的代码"，常量集中、动态逻辑内聚；无中间 JSON 文件，减少一处状态。
- 备选：独立 resolve 步骤产出 `resolved.json` 再由 install 读取——被否，多一个文件与一步操作，收益不大。

**决策 2：`resolveModels()` 解析 `traecli models` 的 stdout 逐行 ID。**
- 选择：spawn `traecli models`，收集 stdout，按行 trim + 过滤空行得到 ID 列表；每个 ID 映射为 `{ id, name: `${id} (Trae)` }`。
- 理由：与实测输出格式一致；stderr 只含日志，忽略即可。
- 备选：解析 JSON 输出——`traecli models` 无 JSON 格式选项，逐行文本是唯一稳定来源。

**决策 3：`resolveTraecli()` 抽到公共位置供配置脚本复用。**
- 选择：把 `src/server.js` 里的 traecli 定位逻辑抽为可复用函数（放 `scripts/lib/config.mjs`），`config/config.mjs` 的 `resolveModels()` 调用它定位可执行文件。
- 理由：避免两处各写一份探测逻辑导致漂移。
- 备选：`config.mjs` 直接依赖 PATH 上的 `traecli`——被否，非标准安装位置会失败，与既有健壮探测能力不一致。

**决策 4：获取失败即中止安装（fail-fast）。**
- 选择：`resolveModels()` 在 spawn 失败、退出码非零或输出为空时抛错；`install.mjs` 捕获后打印清晰错误并 `exit(1)`。
- 理由：避免装出一个空的或过时的模型列表；未登录/未安装 traecli 时明确告知用户先处理前置条件。
- 备选：回退到内置静态列表——被否，用户已明确要求"不要硬编码"，静默回退会掩盖问题。

## Risks / Trade-offs

- [安装机必须已登录 traecli，否则安装中止] → 在 README 与错误信息中明确说明前置条件与排查方式。
- [`traecli models` 首次调用可能触发登录网络请求，增加安装耗时] → 可接受；解析仅在安装时发生一次。
- [删除 `config/trae.json` 属破坏性变更] → 仓库尚未对外分发，影响面小；README 同步更新，`resolveConfig()` 保持返回对象形状不变，下游无需改。
- [未来 `traecli models` 输出格式变化] → 解析逻辑集中在 `resolveModels()` 单处，便于适配。

## Migration Plan

1. 新增 `config/config.mjs`（常量 + `resolveModels()` + `resolveConfig()`）。
2. 在 `scripts/lib/config.mjs` 抽出并导出 `resolveTraecli()`；移除 `readTraeConfig()`。
3. 改造 `scripts/install.mjs`：`await resolveConfig()`，失败中止。
4. 删除 `config/trae.json`；更新 `README.md`。
5. 本地验证：`node scripts/install.mjs` → 确认 `config.json` 与 `provider.trae.models` 反映 `traecli models` 实时输出 → 重启 opencode → `/models` 出现 trae 模型。
6. 回滚：恢复 `config/trae.json` 与旧版 `lib/config.mjs`、`install.mjs`。

## Open Questions

- 无阻塞项。
