## 1. 常量与环境变量更名

- [x] 1.1 `src/server.js:91-94`：`REQUEST_TIMEOUT_MS` → `IDLE_TIMEOUT_MS`，注释从"最长运行时间/超时"改为"空闲超时/静默上限"；环境变量 `TRAE_BRIDGE_TIMEOUT_MS` → `TRAE_BRIDGE_IDLE_TIMEOUT_MS`

## 2. parseStream 新增 onActivity 回调

- [x] 2.1 `src/server.js:343`：`parseStream` 签名新增第七个参数 `onActivity`
- [x] 2.2 `src/server.js:348-372`：在 `child.stdout.on("data")` 内每次成功 `JSON.parse(line)` 后调用 `onActivity()`
- [x] 2.3 更新 `parseStream` 上方注释（342 行附近），说明 `onActivity` 的用途

## 3. 流式路径：绝对超时 → 空闲超时

- [x] 3.1 `src/server.js:504-541`：将一次性 `setTimeout` 替换为 `resetIdleTimer()` 闭包；spawn 成功后立即调用 `resetIdleTimer()`；在传给 `parseStream()` 的 `onActivity` 回调中调用 `resetIdleTimer()`
- [x] 3.2 错误消息/content 中"请求超时" → "空闲超时"

## 4. 非流式路径：绝对超时 → 空闲超时

- [x] 4.1 `src/server.js:592-620`：与流式路径相同改造（`resetIdleTimer` 闭包 + `onActivity` 回调）
- [x] 4.2 错误消息中"请求超时" → "空闲超时"

## 5. 文档同步

- [x] 5.1 `README.md`：环境变量说明从 `TRAE_BRIDGE_TIMEOUT_MS` 改为 `TRAE_BRIDGE_IDLE_TIMEOUT_MS`，描述从"单次 traecli 调用的最长运行时间"改为"空闲超时（连续无输出上限）"；约束一节对应修改
- [x] 5.2 `openspec/specs/trae-bridge/spec.md`：同步新增的空闲超时需求到主规格（若变更归档，由 archive 流程自动完成）
- [x] 5.3 `openspec/changes/idle-timeout/design.md`：若有实现期修正，回写决策记录

## 6. 验证与部署

- [x] 6.1 `node --check src/server.js` 语法校验通过
- [x] 6.2 `openspec validate --all` 通过（含变更内 specs）
- [x] 6.3 `node scripts/install.mjs` 重新部署，确认部署版 `server.js` 含新超时逻辑
- [x] 6.4 启动转接层探活，发送模拟请求确认 `IDLE_TIMEOUT_MS` 与复位逻辑生效

## 7. 代码审查修正

- [x] 7.1 `send()` 加固：`if (res.writableEnded) return`，防止客户端断开后 `res.write()` 抛出未处理异常导致服务崩溃
- [x] 7.2 `respond()` 加固：同 `send()`，防御性保护
- [x] 7.3 `onActivity()` 对 `result` 事件跳过，避免重置后立即被 `finish()` 清除的空转
- [x] 7.4 `resetIdleTimer` 两处加同步注释，提醒修改时互相同步
- [x] 7.5 README 新增环境变量表（`TRAE_BRIDGE_PORT`、`TRAECLI_PATH`、`TRAE_BRIDGE_IDLE_TIMEOUT_MS`）
- [x] 7.6 `trae-bridge.js` `plugin.log` 注释说明不做轮转（日志量极低）
- [x] 7.7 主 spec Purpose 删除 "TBD" 占位符
- [x] 7.8 spec 措辞 "有效流事件" → "任意有效 NDJSON 行"（主 spec + 变更 delta spec，含场景文本）
