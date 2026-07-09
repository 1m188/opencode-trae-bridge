// Trae Bridge 生命周期插件：opencode 启动时拉起本地转接层，退出时关闭它。
// 由安装脚本复制到 ~/.config/opencode/plugins/trae-bridge.js。

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

// 转接层安装目录与文件路径。
const BRIDGE_DIR = path.join(
  os.homedir(),
  ".config",
  "opencode",
  "trae-bridge"
);
const SERVER_PATH = path.join(BRIDGE_DIR, "server.js");

// 插件自身的日志文件；转接层未能启动等诊断信息写此处，绝不写 stdout/stderr，
// 避免污染 opencode TUI 终端。
const LOG_PATH = path.join(BRIDGE_DIR, "plugin.log");

function logLine(msg) {
  try {
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {
    // 忽略：日志写入失败不应影响插件。
  }
}

// 解析 node 可执行文件：优先当前运行 opencode 的 Node（process.execPath），
// 回退到 PATH 上的命令名。opencode 常以独立编译二进制分发，此时 process.execPath
// 指向该二进制而非 node，故再回退到裸命令名交由系统解析。
function resolveNode() {
  const exe = process.execPath;
  if (exe && /node(\.exe)?$/i.test(exe) && fs.existsSync(exe)) return exe;
  return process.platform === "win32" ? "node.exe" : "node";
}

let child = null;

function startBridge() {
  if (child) return;
  if (!fs.existsSync(SERVER_PATH)) {
    logLine(`未找到转接层 server.js，跳过启动：${SERVER_PATH}`);
    return; // 未安装转接层时不启动。
  }
  const node = resolveNode();
  try {
    child = spawn(node, [SERVER_PATH], {
      stdio: "ignore",
      windowsHide: true,
      detached: false,
    });
  } catch (err) {
    logLine(`拉起转接层失败（node="${node}"）：${err.message}`);
    child = null;
    return;
  }
  // spawn 的异步错误（如 node 不在 PATH）走 error 事件，需单独捕获，否则会
  // 抛出未处理异常。
  child.on("error", (err) => {
    logLine(`转接层进程错误（node="${node}"）：${err.message}`);
    child = null;
  });
  child.on("exit", () => {
    child = null;
  });
}

function stopBridge() {
  if (!child) return;
  try {
    child.kill();
  } catch (_) {
    // 忽略：进程可能已退出。
  }
  child = null;
}

export const TraeBridgePlugin = async () => {
  startBridge();

  const cleanup = () => stopBridge();
  process.once("exit", cleanup);
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  return {};
};
