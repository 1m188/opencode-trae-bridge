## Why

当前转接层用**绝对请求超时**保护 traecli 子进程——从 spawn 起计时，到点就杀。对于深度调研、大量网页抓取等长任务，traecli 实际在正常工作中却被超时误杀（用户已踩到）；而对于 traecli 真正卡死（stdout 静默）的场景，却要等足 10 分钟才回收，浪费资源。应改为**空闲超时**，仅当 traecli 持续静默超过阈值才判定卡死并终止，既保护真正挂起的请求，又不误伤积极产出的长任务。

## What Changes

- **BREAKING**：环境变量 `TRAE_BRIDGE_TIMEOUT_MS` 改名为 `TRAE_BRIDGE_IDLE_TIMEOUT_MS`，语义从"绝对请求超时"变为"空闲超时"。旧变量名不再生效。默认 10 分钟（`10 * 60 * 1000`）。
- 流式与非流式两处 timer 从一次性 `setTimeout` 改为可重置的 idle watchdog：每次 traecli stdout 有数据产出（任何 `stream_event` / `assistant` / `result` 行）时重置计时器。
- 日志、错误文案中的"请求超时"字样改为"空闲超时"。
- 同步更新 README、spec 中对该超时行为的描述。

## Capabilities

### New Capabilities
<!-- 无新增模块，是对现有超时机制的行为修正 -->

### Modified Capabilities
- `trae-bridge`：新增"空闲超时保护"需求，替代既有"绝对请求超时"行为。

## Impact

- `src/server.js:91-94`：常量及注释更名
- `src/server.js:528-542`（流式 timer）、`src/server.js:609-612`（非流式 timer）：改为 idle watchdog
- `src/server.js:343-393`（`parseStream`）：每次 stdout 产出时重置 timer
- `openspec/specs/trae-bridge/spec.md`：新增空闲超时场景
- `README.md`：环境变量说明与约束描述更新
