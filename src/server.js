"use strict";

// Trae Bridge —— 将企业版 Trae CLI 封装为 OpenAI 兼容的本地 HTTP 服务。
// 零第三方依赖，仅使用 Node 内置模块。由 opencode 插件在启动时自动拉起。

const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ===== 配置加载 =====

// 安装目录下的 config.json（由 config/config.mjs 在安装时派生）。
// 若不存在或字段缺省，则回退到环境变量与内置默认值。
function loadConfig() {
  // 兜底默认值：仅在同目录 config.json 完全缺失时使用（正常安装会生成该文件）。
  // 这里的 models 只是"零配置直接运行"时的最小占位，与 config/config.mjs 的完整
  // 列表无关；实际分发的模型清单以安装生成的 config.json 为准。
  const defaults = {
    port: 8790,
    host: "127.0.0.1",
    traecliPath: "",
    defaultPermissionMode: "plan",
    maxPromptChars: 30000,
    models: [
      { id: "DeepSeek-V4-Pro", name: "DeepSeek V4 Pro (Trae)" },
      { id: "GLM-5.2", name: "GLM 5.2 (Trae)" },
      { id: "Kimi-K2.7-Code", name: "Kimi K2.7 Code (Trae)" },
    ],
  };

  let file = {};
  try {
    const raw = fs.readFileSync(path.join(__dirname, "config.json"), "utf8");
    file = JSON.parse(raw);
  } catch (_) {
    // 忽略：无配置文件时使用默认值。
  }

  const cfg = Object.assign({}, defaults, file);

  // 环境变量优先级最高，便于临时覆盖。
  const port = Number(process.env.TRAE_BRIDGE_PORT) || cfg.port || defaults.port;
  const host = cfg.host || defaults.host;
  // traecliPath 留空表示"自动探测"，在 resolveTraecli() 中按平台候选路径查找。
  const traecliPath = process.env.TRAECLI_PATH || cfg.traecliPath || "";
  const defaultPermissionMode =
    cfg.defaultPermissionMode || defaults.defaultPermissionMode;
  const maxPromptChars =
    Number.isInteger(cfg.maxPromptChars) && cfg.maxPromptChars > 0
      ? cfg.maxPromptChars
      : defaults.maxPromptChars;
  // 归一化为 id 字符串数组；config.json 里 models 为 [{id,name}]。
  const normalized =
    Array.isArray(cfg.models) && cfg.models.length
      ? cfg.models
          .map((m) => (m && typeof m.id === "string" ? m.id : ""))
          .filter(Boolean)
      : [];
  // 若归一化后为空（配置损坏或全部无效），回退到内置默认，保证至少有一个可用模型。
  const models = normalized.length
    ? normalized
    : defaults.models.map((m) => m.id);

  return { port, host, traecliPath, defaultPermissionMode, maxPromptChars, models };
}

const CONFIG = loadConfig();

// 监听端口（仅绑定回环地址，避免对外暴露）。
const PORT = CONFIG.port;
const HOST = CONFIG.host;

// traecli 可执行文件路径；空字符串表示自动探测。
const TRAECLI_PATH = CONFIG.traecliPath;

// 要暴露给 opencode 的 Trae 模型列表。
const MODELS = CONFIG.models;

// 权限模式信号不明确时的默认值（"plan" 只读 / "bypass_permissions" 可改文件）。
const DEFAULT_PERMISSION_MODE = CONFIG.defaultPermissionMode;

// prompt 作为命令行参数传入，受操作系统命令行长度限制（Windows 约 32K）。
// 预留余量给可执行文件路径与其它参数。
const MAX_PROMPT_CHARS = CONFIG.maxPromptChars;

// 单次 traecli 调用的最长运行时间（毫秒）；超时则杀掉子进程，避免请求永久挂起。
// 可用环境变量 TRAE_BRIDGE_TIMEOUT_MS 覆盖。
const REQUEST_TIMEOUT_MS =
  Number(process.env.TRAE_BRIDGE_TIMEOUT_MS) || 10 * 60 * 1000;

// HTTP 请求体大小上限（字节），防止异常/超大请求耗尽内存。
const MAX_BODY_BYTES = 10 * 1024 * 1024;

// 日志文件路径：所有诊断信息只写文件，绝不写 stdout/stderr，
// 避免污染 opencode TUI 终端。
const LOG_PATH = path.join(__dirname, "trae-bridge.log");

// 追加一行日志到文件（失败时静默忽略）。
function logLine(msg) {
  try {
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {
    // 忽略：日志写入失败不应影响服务。
  }
}

// ===== 辅助函数 =====

// 生成跨平台的 traecli 候选安装路径（不含 PATH 命令名）。
function traecliCandidates() {
  const home = os.homedir();
  const isWin = process.platform === "win32";
  const exe = isWin ? "traecli.exe" : "traecli";
  const bases = [];

  if (isWin) {
    // Windows：优先 %LOCALAPPDATA%，再补充常见回退位置。
    const localAppData =
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    bases.push(path.join(localAppData, "trae-cli", "bin"));
    if (process.env.APPDATA) {
      bases.push(path.join(process.env.APPDATA, "trae-cli", "bin"));
    }
    bases.push(path.join(home, ".trae-cli", "bin"));
  } else {
    // macOS / Linux：常见的用户级与系统级安装位置。
    bases.push(path.join(home, ".local", "bin"));
    bases.push(path.join(home, ".trae-cli", "bin"));
    bases.push("/usr/local/bin");
    bases.push("/opt/homebrew/bin");
    bases.push("/usr/bin");
  }

  return bases.map((b) => path.join(b, exe));
}

// 解析 traecli 可执行文件路径：
// 1) 优先用显式配置/环境变量指定的路径（存在才用）；
// 2) 否则按平台候选路径自动探测；
// 3) 都找不到则回退到 PATH 上的命令名，交由系统解析。
function resolveTraecli() {
  if (TRAECLI_PATH && fs.existsSync(TRAECLI_PATH)) return TRAECLI_PATH;
  for (const candidate of traecliCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return process.platform === "win32" ? "traecli.exe" : "traecli";
}

// 将单条消息的 content 规整为纯文本（兼容字符串或 parts 数组）。
function contentToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

// 将 messages[] 拼平为单个 prompt 字符串；超过上限时保留最近轮次。
function buildPrompt(messages) {
  if (!Array.isArray(messages)) return "";
  const blocks = messages
    .map((m) => {
      const role = (m && m.role) || "user";
      const text = contentToText(m && m.content);
      return text ? `${role.toUpperCase()}: ${text}` : "";
    })
    .filter(Boolean);

  let prompt = blocks.join("\n\n");
  if (prompt.length <= MAX_PROMPT_CHARS) return prompt;

  // 从最旧的块开始丢弃，始终保留最后一块。
  while (blocks.length > 1) {
    blocks.shift();
    prompt = blocks.join("\n\n");
    if (prompt.length <= MAX_PROMPT_CHARS) break;
  }
  // 若单块仍超限，截取尾部（保留最新内容）。
  if (prompt.length > MAX_PROMPT_CHARS) {
    prompt = prompt.slice(prompt.length - MAX_PROMPT_CHARS);
  }
  return prompt;
}

// 根据请求内容推导权限模式：识别到 plan 信号则 plan，识别到 build 信号则放开，
// 否则回退到默认值。
function derivePermissionMode(messages) {
  const haystack = (Array.isArray(messages) ? messages : [])
    .map((m) => contentToText(m && m.content))
    .join("\n")
    .toLowerCase();

  const planSignal =
    haystack.includes("plan mode") ||
    haystack.includes("planning mode") ||
    haystack.includes("read-only") ||
    haystack.includes("do not make any edits") ||
    haystack.includes("present a plan");
  const buildSignal =
    haystack.includes("build mode") || haystack.includes("bypass_permissions");

  if (planSignal) return "plan";
  if (buildSignal) return "bypass_permissions";
  return DEFAULT_PERMISSION_MODE;
}

// 生成一个 OpenAI 风格的补全 id。
function completionId() {
  return "chatcmpl-" + Math.random().toString(36).slice(2, 14);
}

// 构造一个流式分片对象。
function chunkObject(id, created, model, delta, finishReason) {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason || null,
      },
    ],
  };
}

// ===== traecli 调用 =====

// 以无头模式 spawn traecli，只读 stdout；stderr 仅记录，不参与解析。
function spawnTraecli(model, mode, prompt) {
  const exe = resolveTraecli();
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "-c",
    `model.name=${model}`,
    "--permission-mode",
    mode,
    prompt,
  ];
  return spawn(exe, args, { windowsHide: true });
}

// 安全终止 traecli 子进程（若仍在运行）；忽略任何错误。
function killChild(child) {
  if (!child || child.killed) return;
  try {
    child.kill();
  } catch (_) {
    // 忽略：进程可能已退出。
  }
}

// 逐行解析 traecli 的 NDJSON 输出，回调 onDelta(增量文本) 与 onResult(最终文本)。
function parseStream(child, onDelta, onResult, onError, onClose) {
  let buffer = "";
  let finalText = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (data) => {
    buffer += data;
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let evt;
      try {
        evt = JSON.parse(line);
      } catch (_) {
        continue; // 非 JSON 行（不应出现在 stdout，稳妥起见跳过）
      }
      if (evt.type === "stream_event") {
        const piece = evt.delta && evt.delta.content;
        if (piece) {
          finalText += piece;
          onDelta(piece);
        }
      } else if (evt.type === "result") {
        if (typeof evt.result === "string" && evt.result.length) {
          finalText = evt.result;
        }
        onResult(finalText);
      }
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (data) => {
    logLine(`[traecli] ${String(data).trim()}`);
  });

  child.on("error", (err) => onError(err));
  child.on("close", () => onClose(finalText));
}

// ===== HTTP 处理 =====

// GET /v1/models
function handleModels(res) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    object: "list",
    data: MODELS.map((id) => ({
      id,
      object: "model",
      created: now,
      owned_by: "trae",
    })),
  };
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// POST /v1/chat/completions
function handleChat(req, res) {
  let raw = "";
  let bytes = 0;
  let aborted = false;
  req.on("data", (c) => {
    if (aborted) return;
    bytes += c.length;
    if (bytes > MAX_BODY_BYTES) {
      aborted = true;
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "request body too large" } }));
      req.destroy();
      return;
    }
    raw += c;
  });
  req.on("end", () => {
    if (aborted) return;
    let payload;
    try {
      payload = JSON.parse(raw || "{}");
    } catch (_) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "invalid JSON body" } }));
      return;
    }

    const model = payload.model || MODELS[0];
    const messages = payload.messages || [];
    const stream = payload.stream !== false; // 默认流式
    const prompt = buildPrompt(messages);
    const mode = derivePermissionMode(messages);

    if (stream) {
      handleStreaming(res, model, mode, prompt);
    } else {
      handleNonStreaming(res, model, mode, prompt);
    }
  });
}

// 流式响应：将 traecli 增量翻译为 OpenAI SSE 分片。
function handleStreaming(res, model, mode, prompt) {
  const id = completionId();
  const created = Math.floor(Date.now() / 1000);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  // 首个分片带上 role。
  send(chunkObject(id, created, model, { role: "assistant" }, null));

  let child;
  try {
    child = spawnTraecli(model, mode, prompt);
  } catch (err) {
    send(chunkObject(id, created, model, { content: `[trae-bridge 错误] ${err.message}` }, null));
    send(chunkObject(id, created, model, {}, "stop"));
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  let finished = false;
  let timer = null;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (timer) clearTimeout(timer);
    killChild(child);
    send(chunkObject(id, created, model, {}, "stop"));
    res.write("data: [DONE]\n\n");
    res.end();
  };

  // 客户端（opencode）中途断开时，及时杀掉子进程，避免孤儿进程与资源浪费。
  res.on("close", () => {
    if (finished) return;
    finished = true;
    if (timer) clearTimeout(timer);
    killChild(child);
  });

  // 超时保护：traecli 卡死时终止并向客户端回报错误。
  timer = setTimeout(() => {
    if (finished) return;
    logLine(`请求超时（${REQUEST_TIMEOUT_MS}ms），终止 traecli 子进程。`);
    send(
      chunkObject(
        id,
        created,
        model,
        { content: `[trae-bridge 错误] 请求超时（${REQUEST_TIMEOUT_MS}ms）` },
        null
      )
    );
    finish();
  }, REQUEST_TIMEOUT_MS);

  parseStream(
    child,
    (piece) => send(chunkObject(id, created, model, { content: piece }, null)),
    () => finish(),
    (err) => {
      send(chunkObject(id, created, model, { content: `[trae-bridge 错误] ${err.message}` }, null));
      finish();
    },
    () => finish()
  );
}

// 非流式响应：累积全部内容后返回单个补全对象。
function handleNonStreaming(res, model, mode, prompt) {
  const id = completionId();
  const created = Math.floor(Date.now() / 1000);

  const respond = (text, isError) => {
    const body = {
      id,
      object: "chat.completion",
      created,
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: isError ? `[trae-bridge 错误] ${text}` : text,
          },
          finish_reason: "stop",
        },
      ],
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  let child;
  try {
    child = spawnTraecli(model, mode, prompt);
  } catch (err) {
    respond(err.message, true);
    return;
  }

  let done = false;
  let timer = null;
  const settle = (text, isError) => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    killChild(child);
    respond(text, isError);
  };

  // 客户端断开：终止子进程，避免孤儿进程。
  res.on("close", () => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    killChild(child);
  });

  timer = setTimeout(() => {
    logLine(`请求超时（${REQUEST_TIMEOUT_MS}ms），终止 traecli 子进程。`);
    settle(`请求超时（${REQUEST_TIMEOUT_MS}ms）`, true);
  }, REQUEST_TIMEOUT_MS);

  parseStream(
    child,
    () => {},
    (text) => settle(text, false),
    (err) => settle(err.message, true),
    (text) => settle(text, false)
  );
}

// ===== 启动服务 =====

function main() {
  const exe = resolveTraecli();
  // 若解析结果只是裸命令名（未找到绝对路径），记录一条提示，交由 PATH 解析。
  const isBareCommand = !exe.includes("/") && !exe.includes("\\");
  if (isBareCommand) {
    logLine(`提示：未探测到 traecli 绝对路径，将从 PATH 解析 "${exe}"`);
  } else {
    logLine(`已解析 traecli：${exe}`);
  }

  const server = http.createServer((req, res) => {
    const url = (req.url || "").split("?")[0];
    if (req.method === "GET" && url === "/v1/models") {
      handleModels(res);
    } else if (req.method === "POST" && url === "/v1/chat/completions") {
      handleChat(req, res);
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "not found" } }));
    }
  });

  server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      // 端口已被占用：先尝试 GET /v1/models，确认占用者是否为本 bridge 实例。
      // 若是（返回已知格式），则复用即可；否则报错退出，避免静默挂到无关进程。
      const check = http.get(
        `http://${HOST}:${PORT}/v1/models`,
        { timeout: 2000 },
        (checkRes) => {
          let body = "";
          checkRes.on("data", (d) => (body += d));
          checkRes.on("end", () => {
            let ok = false;
            try {
              const j = JSON.parse(body);
              ok = j && j.object === "list" && Array.isArray(j.data);
            } catch (_) {
              ok = false;
            }
            if (ok) {
              logLine(`端口 ${PORT} 已被自身实例占用，复用现有实例，退出。`);
            } else {
              logLine(
                `端口 ${PORT} 被无关进程占用或响应非 bridge 格式；` +
                  `请更换端口或排查占用进程后重试。`
              );
            }
            process.exit(ok ? 0 : 1);
          });
        }
      );
      check.on("error", () => {
        logLine(`端口 ${PORT} 被占用且探活不可达，可能存在非 bridge 监听。`);
        process.exit(1);
      });
      check.on("timeout", () => {
        check.destroy();
        logLine(`端口 ${PORT} 被占用但探活超时，无法确认是否为自身实例。`);
        process.exit(1);
      });
      return;
    }
    logLine(`启动失败：${err.message}`);
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    logLine(`已启动 http://${HOST}:${PORT} （traecli: ${exe}）`);
  });
}

main();
