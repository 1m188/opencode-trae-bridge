// Trae Bridge 状态检查脚本。
// 用法：node scripts/status.mjs
// 报告安装产物是否就位，并对转接层 /v1/models 探活。

import fs from "fs";
import http from "http";
import {
  locateOpencodeConfig,
  readOpencodeConfig,
  targetPaths,
} from "./lib/config.mjs";

function log(msg) {
  process.stdout.write(msg + "\n");
}

function mark(ok) {
  return ok ? "[✓]" : "[✗]";
}

// 探活 GET /v1/models，返回 { ok, models } 或 { ok:false, error }。
function probeModels(host, port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host, port, path: "/v1/models", timeout: 3000 },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            const body = JSON.parse(raw);
            const models = (body.data || []).map((m) => m.id);
            resolve({ ok: res.statusCode === 200, models });
          } catch (err) {
            resolve({ ok: false, error: `响应解析失败：${err.message}` });
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "探活超时（转接层可能未运行）" });
    });
    req.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}

async function main() {
  const tgt = targetPaths();

  log("Trae Bridge 状态检查");
  log("====================");

  // 5.3 检查安装产物
  const files = [
    ["生命周期插件", tgt.pluginFile],
    ["转接层 server.js", tgt.serverFile],
    ["转接层 config.json", tgt.bridgeConfigFile],
  ];
  let allPresent = true;
  for (const [label, p] of files) {
    const ok = fs.existsSync(p);
    if (!ok) allPresent = false;
    log(`${mark(ok)} ${label}：${p}`);
  }

  // opencode 配置中的 provider.trae
  const loc = locateOpencodeConfig();
  let providerOk = false;
  if (!loc.needsCreate && fs.existsSync(loc.path)) {
    try {
      const cfg = readOpencodeConfig(loc.path);
      providerOk = !!(cfg.provider && cfg.provider.trae);
    } catch (_) {
      providerOk = false;
    }
  }
  log(`${mark(providerOk)} opencode provider.trae 已注册：${loc.path}`);

  if (!allPresent || !providerOk) {
    log("");
    log("尚未完整安装。请运行：node scripts/install.mjs");
  }

  // 5.4 探活 /v1/models
  log("");
  log("转接层探活：");
  // 读取实际部署的 config.json（转接层真正监听的 host/port），而非源仓库 trae.json，
  // 避免用户改了源配置但未重装时探错端口。
  let host = "127.0.0.1";
  let port = 8790;
  try {
    const deployed = JSON.parse(fs.readFileSync(tgt.bridgeConfigFile, "utf8"));
    if (typeof deployed.host === "string" && deployed.host) host = deployed.host;
    if (Number.isInteger(deployed.port)) port = deployed.port;
  } catch (_) {
    // 部署配置缺失或损坏：使用默认值。
  }
  const probe = await probeModels(host, port);
  if (probe.ok) {
    log(`${mark(true)} http://${host}:${port}/v1/models 可用`);
    log(`    模型：${probe.models.join(", ")}`);
  } else {
    log(`${mark(false)} http://${host}:${port}/v1/models 不可用`);
    log(`    原因：${probe.error}`);
    log("    提示：转接层由 opencode 插件在启动时拉起；请确认 opencode 正在运行。");
  }
}

main().catch((err) => {
  process.stderr.write(`[状态检查失败] ${err.message}\n`);
  process.exit(1);
});
