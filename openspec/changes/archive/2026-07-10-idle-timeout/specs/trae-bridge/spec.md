## ADDED Requirements

### Requirement: 空闲超时保护

转接层 SHALL 为每次 traecli 子进程设置空闲超时看门狗，其阈值通过环境变量 `TRAE_BRIDGE_IDLE_TIMEOUT_MS` 配置，缺省为 10 分钟（`600000` 毫秒）。转接层 SHALL 在每次从 traecli stdout 解析到任意有效 NDJSON 行时重置该看门狗。若在阈值内未产出任何新行，转接层 SHALL 判定 traecli 已卡死，终止子进程，并向客户端回报空闲超时错误。此机制 SHALL 同时适用于流式与非流式请求路径。

#### Scenario: 积极产出的长任务不被误杀

- **WHEN** traecli 持续产出 `stream_event`、`assistant` 或 `result` 事件，即便总运行时间远超空闲阈值
- **THEN** 每次 stdout 行重置看门狗，转接层不触发空闲超时，请求正常完成

#### Scenario: 静默超过程判定为卡死

- **WHEN** traecli 子进程已 spawn，但在空闲阈值时段内 stdout 未产出任何可解析 NDJSON 行
- **THEN** 转接层终止子进程，记录日志（含"空闲超时"字样及时长），并向客户端回报错误（含 `[trae-bridge 错误] 空闲超时（<毫秒>ms）`）

#### Scenario: 客户端断开时取消看门狗

- **WHEN** HTTP 客户端在请求未完成前断开连接（`res.on("close")`）
- **THEN** 转接层清除空闲超时看门狗并终止 traecli 子进程，避免残留定时器引用
