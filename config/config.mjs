// Trae Bridge 配置源（可执行）。零第三方依赖，仅用 Node 内置模块。
// 取代旧的静态 config/trae.json：常量项直接定义，模型列表在安装时
// 通过执行 `traecli models` 实时获取，保证与 Trae 平台一致。

import { spawn } from "child_process";
import { resolveTraecli } from "../scripts/lib/config.mjs";

// ===== 常量配置 =====

// 转接层监听端口。
export const port = 8790;

// 监听地址（仅回环，避免对外暴露）。
export const host = "127.0.0.1";

// traecli 可执行文件的显式路径。通常留空（""）即可，由 resolveTraecli() 自动探测；
// 仅在非标准安装位置时才需填写。
export const traecliPath = "";

// 权限模式信号不明确时的默认值："plan"（只读）或 "bypass_permissions"（可改文件）。
export const defaultPermissionMode = "plan";

// prompt 作为命令行参数的字符上限。
export const maxPromptChars = 30000;

// ===== 动态配置：实时获取模型列表 =====

// 执行 `traecli models`，收集 stdout；stderr 仅用于错误诊断，不参与解析。
function runTraeModels() {
  return new Promise((resolve, reject) => {
    const exe = resolveTraecli(traecliPath);
    let child;
    try {
      child = spawn(exe, ["models"], { windowsHide: true });
    } catch (err) {
      reject(new Error(`无法启动 traecli（${exe}）：${err.message}`));
      return;
    }

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d) => (stderr += d));

    child.on("error", (err) => {
      reject(new Error(`无法启动 traecli（${exe}）：${err.message}`));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        const detail = stderr.trim() || `退出码 ${code}`;
        reject(
          new Error(
            `执行 \`traecli models\` 失败（${detail}）。` +
              `请确认 traecli 已安装并已登录。`
          )
        );
        return;
      }
      resolve(stdout);
    });
  });
}

// 解析 `traecli models` 的输出为模型列表：按行 trim、过滤空行得到 ID，
// 每个 ID 映射为 { id, name: "<id> (Trae)" }。列表为空则抛错。
export async function resolveModels() {
  const stdout = await runTraeModels();
  const ids = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!ids.length) {
    throw new Error(
      "`traecli models` 未返回任何模型。请确认 traecli 已安装并已登录。"
    );
  }

  return ids.map((id) => ({ id, name: `${id} (Trae)` }));
}

// 汇总常量与实时模型列表，返回完整配置对象（形状与旧 readTraeConfig() 一致），
// 供安装脚本派生 provider 与转接层配置。
export async function resolveConfig() {
  return {
    port,
    host,
    traecliPath,
    defaultPermissionMode,
    maxPromptChars,
    models: await resolveModels(),
  };
}
