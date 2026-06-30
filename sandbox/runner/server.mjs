// Sandbox runner: a tiny HTTP host that executes one user program per request in
// a resource-limited subprocess and returns a RunCodeReport. The app calls this
// over HTTPS (authenticated with EXECUTOR_API_KEY). The subprocess gets ONLY the
// broker URL + the per-run token in its environment — no other secrets.
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 8080);
const EXECUTOR_API_KEY = process.env.EXECUTOR_API_KEY ?? "";
const DIR = path.dirname(fileURLToPath(import.meta.url));

const RUNTIMES = {
  python: { harness: path.join(DIR, "harness.py"), cmd: "python3", userFile: "user.py" },
  javascript: { harness: path.join(DIR, "harness.mjs"), cmd: "node", userFile: "user.mjs" },
};

const SENTINEL = "__SANDBOX_RESULT__";

function send(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function errorReport(message, extra = {}) {
  return { status: "error", stdout: "", files: [], durationMs: 0, exitCode: null, error: { message }, ...extra };
}

async function runOnce(input) {
  const rt = RUNTIMES[input.language];
  if (!rt) return errorReport(`unsupported language: ${input.language}`);

  const work = await mkdtemp(path.join(tmpdir(), "run-"));
  try {
    await writeFile(path.join(work, rt.userFile), String(input.code ?? ""), "utf8");

    const memKb = Math.max(64, Math.floor(Number(input.memoryMb ?? 256))) * 1024;
    const wallMs = Math.min(Math.max(Number(input.timeoutMs ?? 20_000), 1_000), 60_000);
    const maxOut = Math.max(1_024, Number(input.maxOutputBytes ?? 64_000));

    // ulimit caps the address space (anti-OOM / fork-bomb); the harness gets only
    // the broker url + run token — never EXECUTOR_API_KEY or any host secret.
    const shellCmd = `ulimit -v ${memKb}; exec ${rt.cmd} ${JSON.stringify(rt.harness)}`;
    const child = spawn("/bin/sh", ["-c", shellCmd], {
      cwd: work,
      env: {
        PATH: process.env.PATH,
        HOME: work,
        USER_FILE: path.join(work, rt.userFile),
        SANDBOX_BROKER_URL: input.brokerUrl ?? "",
        SANDBOX_RUN_TOKEN: input.runToken ?? "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const started = Date.now();
    let out = "";
    let stderr = "";
    let truncated = false;
    let killedForOutput = false;
    let killedForTimeout = false;

    child.stdout.on("data", (buf) => {
      if (killedForOutput) return;
      out += buf.toString("utf8");
      if (out.length > maxOut) {
        out = out.slice(0, maxOut);
        truncated = true;
        killedForOutput = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (buf) => {
      if (stderr.length < maxOut) stderr += buf.toString("utf8");
    });

    const timer = setTimeout(() => {
      killedForTimeout = true;
      child.kill("SIGKILL");
    }, wallMs);

    const exitCode = await new Promise((resolve) => child.on("close", resolve));
    clearTimeout(timer);
    const durationMs = Date.now() - started;

    // The harness prints a sentinel line carrying {status, result, error}; text
    // before it is the program's stdout.
    let meta = null;
    let stdout = out;
    const idx = out.lastIndexOf(SENTINEL);
    if (idx >= 0) {
      stdout = out.slice(0, idx).replace(/\n$/, "");
      try {
        meta = JSON.parse(out.slice(idx + SENTINEL.length));
      } catch {
        meta = null;
      }
    }

    if (killedForTimeout) return { ...errorReport(`Timed out after ${wallMs}ms`), status: "timeout", stdout, durationMs, truncated };
    if (killedForOutput) return { ...errorReport("Output limit exceeded"), stdout, durationMs, truncated: true };
    if (meta?.status === "error") return { status: "error", stdout, files: [], durationMs, exitCode, error: meta.error ?? { message: "error" }, truncated };
    if (!meta && exitCode !== 0) return { ...errorReport(stderr.slice(0, 2_000) || `exited with code ${exitCode}`), stdout, durationMs, exitCode, truncated };
    return { status: "ok", stdout, result: meta ? meta.result : null, files: [], durationMs, exitCode, truncated };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

http
  .createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
    if (req.method !== "POST" || req.url !== "/run") return send(res, 404, { error: "not found" });
    if (!EXECUTOR_API_KEY || req.headers["x-executor-key"] !== EXECUTOR_API_KEY) {
      return send(res, 401, { error: "unauthorized" });
    }

    let input;
    try {
      input = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { error: "invalid json" });
    }

    try {
      send(res, 200, await runOnce(input));
    } catch (error) {
      send(res, 200, errorReport(String(error?.message ?? error)));
    }
  })
  .listen(PORT, () => console.log(`sandbox runner listening on :${PORT}`));
