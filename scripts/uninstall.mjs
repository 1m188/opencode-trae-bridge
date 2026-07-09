// Trae Bridge 卸载脚本。
// 用法：node scripts/uninstall.mjs
// 精确移除安装产物，并从 opencode 配置撤销 provider.trae；改动前先备份。

import fs from "fs";
import {
  locateOpencodeConfig,
  readOpencodeConfig,
  backupFile,
  pruneBackups,
  targetPaths,
  writeJson,
} from "./lib/config.mjs";

function log(msg) {
  process.stdout.write(msg + "\n");
}

function main() {
  const tgt = targetPaths();

  // 5.1 删除插件文件与 trae-bridge/ 目录
  if (fs.existsSync(tgt.pluginFile)) {
    fs.rmSync(tgt.pluginFile, { force: true });
    log(`[✓] 已删除插件：${tgt.pluginFile}`);
  } else {
    log(`[i] 插件不存在，跳过：${tgt.pluginFile}`);
  }

  // 若 plugins/package.json 是我们写入的（仅含 {"type":"module"}）且目录内已无其它插件，
  // 则一并清理，避免残留影响用户其它 CommonJS 插件。
  if (fs.existsSync(tgt.pluginsPkgFile)) {
    let removable = false;
    try {
      const pkg = JSON.parse(fs.readFileSync(tgt.pluginsPkgFile, "utf8"));
      const keys = Object.keys(pkg);
      const onlyTypeModule =
        keys.length === 1 && keys[0] === "type" && pkg.type === "module";
      const others = fs
        .readdirSync(tgt.pluginsDir)
        .filter((n) => n !== "package.json");
      removable = onlyTypeModule && others.length === 0;
    } catch (_) {
      removable = false;
    }
    if (removable) {
      fs.rmSync(tgt.pluginsPkgFile, { force: true });
      log(`[✓] 已删除插件模块声明：${tgt.pluginsPkgFile}`);
    }
  }

  if (fs.existsSync(tgt.bridgeDir)) {
    fs.rmSync(tgt.bridgeDir, { recursive: true, force: true });
    log(`[✓] 已删除转接层目录：${tgt.bridgeDir}`);
  } else {
    log(`[i] 转接层目录不存在，跳过：${tgt.bridgeDir}`);
  }

  // 5.2 备份后从 opencode 配置移除 provider.trae
  const loc = locateOpencodeConfig();
  if (loc.needsCreate || !fs.existsSync(loc.path)) {
    log(`[i] 未找到 opencode 配置，无需清理。`);
  } else {
    const config = readOpencodeConfig(loc.path);
    let changed = false;

    if (config.provider && config.provider.trae) {
      delete config.provider.trae;
      changed = true;
      // 若 provider 已空则一并移除，保持配置整洁。
      if (Object.keys(config.provider).length === 0) delete config.provider;
    }

    if (changed) {
      const backup = backupFile(loc.path);
      if (backup) {
        log(`[✓] 已备份 opencode 配置：${backup}`);
        pruneBackups(loc.path);
      }
      writeJson(loc.path, config);
      log(`[✓] 已从 opencode 配置移除 trae 相关项：${loc.path}`);
    } else {
      log(`[i] opencode 配置无 trae 相关项，无需改动。`);
    }
  }

  log("");
  log("卸载完成。请重启 opencode 使变更生效。");
}

try {
  main();
} catch (err) {
  process.stderr.write(`[卸载失败] ${err.message}\n`);
  process.exit(1);
}
