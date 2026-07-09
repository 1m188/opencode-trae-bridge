// Trae Bridge 安装脚本（幂等）。
// 用法：node scripts/install.mjs

import fs from "fs";
import {
  readTraeConfig,
  locateOpencodeConfig,
  readOpencodeConfig,
  deriveProvider,
  deriveBridgeConfig,
  backupFile,
  pruneBackups,
  deepMerge,
  targetPaths,
  sourcePaths,
  ensureDir,
  writeJson,
} from "./lib/config.mjs";

function log(msg) {
  process.stdout.write(msg + "\n");
}

function main() {
  // 参数校验：本脚本不接受任何参数（--set-default 已移除）。
  const unknown = process.argv.slice(2);
  if (unknown.length) {
    log(`[!] 忽略未知参数：${unknown.join(" ")}（install.mjs 不接受任何参数）`);
  }

  // 读取并校验单一配置源。
  const traeCfg = readTraeConfig();
  const src = sourcePaths();
  const tgt = targetPaths();

  // 前置检查：源文件必须存在。
  for (const f of [src.serverFile, src.pluginFile]) {
    if (!fs.existsSync(f)) {
      log(`[错误] 缺少源文件：${f}`);
      process.exit(1);
    }
  }

  // 4.1 复制 server.js → ~/.config/opencode/trae-bridge/server.js
  ensureDir(tgt.bridgeDir);
  fs.copyFileSync(src.serverFile, tgt.serverFile);
  log(`[✓] 部署转接层：${tgt.serverFile}`);

  // 4.2 生成 ~/.config/opencode/trae-bridge/config.json（由 trae.json 派生）
  writeJson(tgt.bridgeConfigFile, deriveBridgeConfig(traeCfg));
  log(`[✓] 生成转接层配置：${tgt.bridgeConfigFile}`);

  // 4.3 复制插件 → ~/.config/opencode/plugins/trae-bridge.js
  ensureDir(tgt.pluginsDir);
  fs.copyFileSync(src.pluginFile, tgt.pluginFile);
  log(`[✓] 部署生命周期插件：${tgt.pluginFile}`);

  // 插件使用 ESM 语法（import/export），而 plugins/ 目录默认无 package.json，
  // Node 会按 CommonJS 解析 .js。写入最小 package.json 声明 type=module，
  // 确保插件以 ESM 加载，不依赖宿主的隐式行为。
  if (!fs.existsSync(tgt.pluginsPkgFile)) {
    writeJson(tgt.pluginsPkgFile, { type: "module" });
    log(`[✓] 写入插件模块声明：${tgt.pluginsPkgFile}`);
  } else {
    let pkg = {};
    try {
      pkg = JSON.parse(fs.readFileSync(tgt.pluginsPkgFile, "utf8"));
    } catch (_) {
      pkg = {};
    }
    if (pkg.type !== "module") {
      log(
        `[!] ${tgt.pluginsPkgFile} 已存在且 type≠module；插件为 ESM，可能无法加载。请手工确认。`
      );
    }
  }

  // 4.4 备份后深合并 provider.trae 进 opencode 配置并写回（幂等）
  const loc = locateOpencodeConfig();
  ensureDir(tgt.opencodeDir);
  let config = {};
  if (!loc.needsCreate) {
    config = readOpencodeConfig(loc.path);
    const backup = backupFile(loc.path);
    if (!backup) {
      log(`[错误] 备份 opencode 配置失败，已中止以避免损坏：${loc.path}`);
      process.exit(1);
    }
    log(`[✓] 已备份 opencode 配置：${backup}`);
    pruneBackups(loc.path);
  } else {
    log(`[i] 未找到 opencode 配置，将新建：${loc.path}`);
  }

  const provider = deriveProvider(traeCfg);
  // 幂等：先移除旧的 trae provider，再合并新的，避免残留旧模型条目。
  if (config.provider && config.provider.trae) {
    delete config.provider.trae;
  }
  // $schema：新建配置时补上以启用编辑器校验；对既有配置仅保留其原值，不强加。
  const patch = { provider: { trae: provider } };
  if (loc.needsCreate) {
    patch.$schema = "https://opencode.ai/config.json";
  } else if (typeof config.$schema === "string") {
    patch.$schema = config.$schema;
  }
  const merged = deepMerge(config, patch);

  writeJson(loc.path, merged);
  log(`[✓] 已写入 opencode 配置：${loc.path}`);

  // 4.6 打印后续步骤
  log("");
  log("安装完成。后续步骤：");
  log("  1. 完全退出并重新启动 opencode");
  log("  2. 运行 /models，确认出现 trae/* 模型");
  log("  3. 选择 trae 模型开始对话");
  log("  提示：如需检查状态可运行 node scripts/status.mjs");
}

try {
  main();
} catch (err) {
  process.stderr.write(`[安装失败] ${err.message}\n`);
  process.exit(1);
}
