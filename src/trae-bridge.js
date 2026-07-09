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

let child = null;

function startBridge() {
  if (child) return;
  if (!fs.existsSync(SERVER_PATH)) return; // 未安装转接层时不启动。
  const node = process.platform === "win32" ? "node.exe" : "node";
  child = spawn(node, [SERVER_PATH], {
    stdio: "ignore",
    windowsHide: true,
    detached: false,
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
