// Trae Bridge 安装器公共库（零第三方依赖，仅用 Node 内置模块）。
// 负责：定位 traecli 可执行文件、定位 opencode 用户配置、JSONC 解析、
// 派生 provider 与转接层配置、备份、深合并、路径解析。
// 配置源为可执行的 config/config.mjs（不再读取静态 config/trae.json）。

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 仓库根目录（scripts/lib 上两级）。
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

// opencode 用户配置目录。
export const OPENCODE_DIR = path.join(os.homedir(), ".config", "opencode");

// ===== traecli 可执行文件定位（与 src/server.js 的探测逻辑对齐）=====

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
// 1) 优先环境变量 TRAECLI_PATH（存在才用）；
// 2) 其次显式传入的 traecliPath（存在才用）；
// 3) 否则按平台候选路径自动探测；
// 4) 都找不到则回退到 PATH 上的命令名，交由系统解析。
export function resolveTraecli(traecliPath = "") {
  const envPath = process.env.TRAECLI_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  if (traecliPath && fs.existsSync(traecliPath)) return traecliPath;
  for (const candidate of traecliCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return process.platform === "win32" ? "traecli.exe" : "traecli";
}

// ===== 3.2 定位 opencode 用户配置 =====
// 优先 .jsonc，其次 .json；均无则返回将要创建的 .jsonc 路径（needsCreate=true）。

export function locateOpencodeConfig() {
  const jsonc = path.join(OPENCODE_DIR, "opencode.jsonc");
  const json = path.join(OPENCODE_DIR, "opencode.json");
  if (fs.existsSync(jsonc)) return { path: jsonc, needsCreate: false };
  if (fs.existsSync(json)) return { path: json, needsCreate: false };
  return { path: jsonc, needsCreate: true };
}

// ===== 3.3 零依赖 JSONC 解析（去注释/尾逗号）=====
// 逐字符扫描，正确跳过字符串内的 // 与 /* */，避免误伤 URL 等；
// 尾逗号清理同样在扫描状态机内完成，绝不改动字符串字面量内部的逗号。

export function stripJsonc(text) {
  let out = "";
  let i = 0;
  const n = text.length;
  let inString = false;
  let quote = "";
  // 记录已写入 out 的、位于结构层（非字符串）的最后一个逗号在 out 中的下标；
  // 若其后直到 } 或 ] 之间只有空白，则该逗号为尾逗号，需删除。
  let lastCommaIdx = -1;
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === "\\") {
        // 转义字符：连同下一个字符原样保留。
        out += next || "";
        i += 2;
        continue;
      }
      if (c === quote) inString = false;
      i += 1;
      continue;
    }
    // 非字符串状态
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      lastCommaIdx = -1;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      // 行注释：跳到行尾。
      i += 2;
      while (i < n && text[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      // 块注释：跳到 */。
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (c === ",") {
      lastCommaIdx = out.length;
      out += c;
      i += 1;
      continue;
    }
    if (c === "}" || c === "]") {
      // 尾逗号：若记录的逗号后仅有空白，则删除该逗号。
      if (lastCommaIdx >= 0 && out.slice(lastCommaIdx + 1).trim() === "") {
        out = out.slice(0, lastCommaIdx) + out.slice(lastCommaIdx + 1);
      }
      lastCommaIdx = -1;
      out += c;
      i += 1;
      continue;
    }
    if (c !== " " && c !== "\t" && c !== "\r" && c !== "\n") {
      // 遇到任何非空白、非闭合符的实义字符，逗号不再是"尾"逗号。
      lastCommaIdx = -1;
    }
    out += c;
    i += 1;
  }
  return out;
}

// 安全解析 JSONC 文本；失败时抛出清晰错误，调用方据此中止且不破坏原文件。
export function parseJsonc(text, sourcePath) {
  try {
    return JSON.parse(stripJsonc(text));
  } catch (err) {
    throw new Error(
      `解析 ${sourcePath || "配置"} 失败（可能含不支持的语法）：${err.message}\n` +
        `为避免损坏，已中止。请手工检查该文件。`
    );
  }
}

// 读取并解析 opencode 配置文件；不存在时返回空对象。
export function readOpencodeConfig(cfgPath) {
  if (!fs.existsSync(cfgPath)) return {};
  const raw = fs.readFileSync(cfgPath, "utf8");
  return parseJsonc(raw, cfgPath);
}

// ===== 3.4 由配置对象派生 provider.trae 与转接层 config.json =====

export function deriveProvider(traeCfg) {
  const models = {};
  for (const m of traeCfg.models) {
    // reasoning:true 让 opencode 将 SSE 的 reasoning_content 渲染为思考块（自定义
    // provider 默认为 false，不设则思考块不显示）；interleaved 指定思考字段名，
    // 使多轮对话中思考上下文正确保留。二者均为 opencode 模型配置的顶层字段。
    models[m.id] = {
      name: m.name,
      reasoning: true,
      interleaved: { field: "reasoning_content" },
    };
  }
  return {
    npm: "@ai-sdk/openai-compatible",
    name: "Trae (企业版)",
    options: {
      baseURL: `http://${traeCfg.host}:${traeCfg.port}/v1`,
    },
    models,
  };
}

export function deriveBridgeConfig(traeCfg) {
  return {
    port: traeCfg.port,
    host: traeCfg.host,
    traecliPath: traeCfg.traecliPath,
    defaultPermissionMode: traeCfg.defaultPermissionMode,
    maxPromptChars: traeCfg.maxPromptChars,
    models: traeCfg.models,
  };
}

// ===== 3.5 备份、深合并、目标路径解析 =====

// 为文件创建带时间戳的备份，返回备份路径；文件不存在则返回 null。
export function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${filePath}.bak-${stamp}`;
  fs.copyFileSync(filePath, backup);
  return backup;
}

// 清理某文件的历史备份，仅保留最新的 keep 个（按文件名时间戳降序）。
// 返回被删除的备份数量；出错时静默返回 0，不影响主流程。
export function pruneBackups(filePath, keep = 5) {
  try {
    const dir = path.dirname(filePath);
    const prefix = path.basename(filePath) + ".bak-";
    const backups = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith(prefix))
      .sort()
      .reverse();
    let removed = 0;
    for (const name of backups.slice(keep)) {
      fs.rmSync(path.join(dir, name), { force: true });
      removed += 1;
    }
    return removed;
  } catch (_) {
    return 0;
  }
}

// 深合并：将 source 合并进 target（源覆盖目标），返回新对象。
export function deepMerge(target, source) {
  const isObj = (v) =>
    v && typeof v === "object" && !Array.isArray(v);
  if (!isObj(target) || !isObj(source)) return source;
  const out = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (isObj(source[key]) && isObj(out[key])) {
      out[key] = deepMerge(out[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

// 安装目标路径集合。
export function targetPaths() {
  const bridgeDir = path.join(OPENCODE_DIR, "trae-bridge");
  return {
    opencodeDir: OPENCODE_DIR,
    pluginsDir: path.join(OPENCODE_DIR, "plugins"),
    pluginFile: path.join(OPENCODE_DIR, "plugins", "trae-bridge.js"),
    pluginsPkgFile: path.join(OPENCODE_DIR, "plugins", "package.json"),
    bridgeDir,
    serverFile: path.join(bridgeDir, "server.js"),
    bridgeConfigFile: path.join(bridgeDir, "config.json"),
  };
}

// 源文件路径集合。
export function sourcePaths() {
  return {
    serverFile: path.join(REPO_ROOT, "src", "server.js"),
    pluginFile: path.join(REPO_ROOT, "src", "trae-bridge.js"),
  };
}

// 确保目录存在。
export function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// 将对象写为格式化 JSON。
export function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}
