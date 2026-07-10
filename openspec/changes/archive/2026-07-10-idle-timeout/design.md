## Context

当前 `src/server.js` 在流式 (`handleStreaming`) 与非流式 (`handleNonStreaming`) 两条请求路径各设了一个一次性 `setTimeout`，阈值为 `REQUEST_TIMEOUT_MS`（默认 10 分钟）。从 `spawnTraecli()` 那一刻起倒计时，到点无论 traecli 是否仍在产出，一律 `killChild()` + 回报 `[trae-bridge 错误] 请求超时`。该逻辑无法区分「traecli 挂起无输出」与「traecli 在积极工作但总耗时较长」——前者已被保护住（虽然要多等足额时长），后者却被误杀。用户在深度调研场景（大量并发 WebFetch 与子代理调用）踩到了后者：traecli 明明马上要写出最终报告，却在收尾前被 10 分钟绝对超时终止。

## Goals / Non-Goals

**Goals:**
- 长任务只要 traecli 持续有 stdout 产出就不被中断
- traecli 真正挂起（stdout 静默）时仍能被及时回收，不浪费端口/进程资源
- 流式与非流式两条路径统一采用同一套 idle watchdog 策略

**Non-Goals:**
- 不引入进程外持久化或自愈重启等更高阶的看门狗策略
- 不改变 traecli 自身的超时行为（那是 traecli 内部的）
- 不新增 opencode 配置变更——超时值仍仅由环境变量控制

## Decisions

**决策 1：采用空闲超时（idle timeout）替代绝对超时（wall-clock timeout）。**

- 选择：在 `parseStream()` 每解析到一条有效 NDJSON 行（`stream_event` / `assistant` / `result`）时重置看门狗。timer 仅在没有新输出的连续静默期内到期。
- 理由：区分"积极工作"与"挂死"的唯一可靠信号就是 stdout 是否持续有产出。绝对超时无法做此区分。
- 备选：完全去掉超时保护——被否，真实卡死场景（traecli hang）仍需兜底回收。

**决策 2：通过 `parseStream` 新增 `onActivity` 回调传递"有产出"信号。**

- 选择：`parseStream(child, onReasoning, onToolCall, onResult, onError, onClose, onActivity)`——第七个参数。在 `child.stdout.on("data")` 内每次成功 `JSON.parse()` 后调用 `onActivity()`。
- 理由：`parseStream` 是唯一知道 stdout 何时有新数据的地方；调用方则持有 timer 引用。回调是最小侵入的惯用模式。
- 备选：在 `parseStream` 内部管理 timer——被否，因为 timer 需要与调用方的 `finished` 状态、`res` 生命周期协调（`res.on("close")` 清除、`finish/settle` 清除），内聚性更差。

**决策 3：timer 封装为 `resetIdleTimer(onTimeout)` 工具函数。**

- 选择：每个请求路径在 start 时创建闭包 `let timer = null; const resetIdleTimer = () => { if (timer) clearTimeout(timer); timer = setTimeout(onTimeout, IDLE_TIMEOUT_MS); };`，spawn 成功后立即调用一次，此后每次 `onActivity` 再调用。
- 理由：`setTimeout` + `clearTimeout` 是 Node 内置，零代价。不需要第三方库也不值得引入抽象。

**决策 4：环境变量改名 `TRAE_BRIDGE_TIMEOUT_MS` → `TRAE_BRIDGE_IDLE_TIMEOUT_MS`（BREAKING）。**

- 选择：仅接受新变量名，旧名不兼容。常量从 `REQUEST_TIMEOUT_MS` 改为 `IDLE_TIMEOUT_MS`。
- 理由：语义改变足够大（绝对→空闲），继续接受旧名会让人误以为行为未变。文档/错误消息同步更新，避免混淆。
- 备选：兼容两变量名——被否，增加实现复杂度，且语义不匹配=潜在坑。

**决策 5：默认值保持 10 分钟。**

- 选择：`IDLE_TIMEOUT_MS = Number(process.env.TRAE_BRIDGE_IDLE_TIMEOUT_MS) || 10 * 60 * 1000`。
- 理由：10 分钟连续静默在正常 traecli 运行中极罕见（即便是慢速网页抓取，推理本身也会持续产生 reasoning 事件）。保留该值作为安全网足够保守。

## Risks / Trade-offs

- **[风险] traecli 在单个工具执行内部（如一次网页抓取）长时间无 stdout 输出** → 空闲超时可能误判。缓解：10 分钟静默足够覆盖绝大多数单次操作；若遇极端慢速网络可设 `TRAE_BRIDGE_IDLE_TIMEOUT_MS=1800000`。
- **[风险] 环境变量改名是 BREAKING** → 已设置 `TRAE_BRIDGE_TIMEOUT_MS` 的用户需要手动改名。缓解：在 README 显著位置标注变化，install.mjs 不干预环境变量无需适配。
- **[权衡] 解析每行 JSON 后都 reset timer，高频重置有微小开销** → `clearTimeout` + `setTimeout` 是 O(1) 操作，每秒数百次也完全可忽略，不做优化。
