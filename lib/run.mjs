// lib/run.mjs — 子进程封装。所有外部脚本（skill 的 capture/lines、生成脚本）都从这里走。
import { spawn } from "node:child_process";

export function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, {
      cwd: opts.cwd || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...(opts.env || {}) },
      windowsHide: true,
    });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; if (opts.echo) process.stdout.write(d); });
    p.stderr.on("data", (d) => { err += d; if (opts.echo) process.stderr.write(d); });
    p.on("error", (e) => resolve({ code: -1, out, err: err + "\n" + e.message }));
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

export const node = (args, opts) => run(process.execPath, args, opts);
