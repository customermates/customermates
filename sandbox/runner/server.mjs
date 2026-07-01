// Sandbox runner: a tiny HTTP host that executes one user program per request in
// a resource-limited subprocess and returns a RunCodeReport. Ingress auth is handled
// entirely by AWS (a per-run JWE token validated before the request ever reaches this
// process — see infra/code-exec/code-exec-stack.ts); there is no app-level API key to
// check here. The subprocess gets ONLY the broker URL + the per-run token (+ a
// mode-scoped proxy URL, when set) in its environment — no other secrets.
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 8080);
const DIR = path.dirname(fileURLToPath(import.meta.url));

const RUNTIMES = {
  python: { harness: path.join(DIR, "harness.py"), cmd: "python3", userFile: "user.py" },
  javascript: { harness: path.join(DIR, "harness.mjs"), cmd: "node", userFile: "user.mjs" },
  // bash has no harness/sentinel — user.sh IS the program; stdout is the only result.
  bash: { cmd: "bash", userFile: "user.sh", noHarness: true },
};

const SENTINEL = "__SANDBOX_RESULT__";

function send(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

// SIGKILL the whole process group (the child is a group leader via detached:true),
// so a backgrounded `curl &` / fork-bomb can't outlive the run.
function killGroup(child) {
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

const MAX_BODY_BYTES = 40_000_000; // defense-in-depth cap (input files inflate the body)
async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function errorReport(message, extra = {}) {
  return { status: "error", stdout: "", files: [], durationMs: 0, exitCode: null, error: { message }, ...extra };
}

const ART_MAX_FILES = 8;
const ART_MAX_BYTES = 5_000_000; // per file
const MIME = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml",
  webp: "image/webp", csv: "text/csv", json: "application/json", txt: "text/plain", html: "text/html",
  pdf: "application/pdf", xml: "application/xml", md: "text/markdown",
};
function mimeFor(name) {
  return MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

// Strip any path components and reject traversal so a caller-supplied input name
// can't escape the workspace. Returns a safe basename or null.
function safeInputName(name) {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  if (!base || base === "." || base === "..") return null;
  // Reject control chars (incl. NUL) — a NUL makes writeFile throw and aborts the run.
  for (let i = 0; i < base.length; i++) if (base.charCodeAt(i) < 0x20) return null;
  return base;
}

// Write user-uploaded input files into the workspace BEFORE the code runs, so the
// program can open() them by name. Returns the set of names actually written (to
// exclude from output-artifact collection). Bounded the same way as outputs.
async function writeInputFiles(dir, inputFiles, userFile) {
  const written = new Set();
  let total = 0;
  for (const f of inputFiles ?? []) {
    if (written.size >= ART_MAX_FILES) break;
    const name = safeInputName(f?.name);
    if (!name || name === userFile || written.has(name)) continue;
    let buf;
    try {
      buf = Buffer.from(String(f?.dataBase64 ?? ""), "base64");
    } catch {
      continue;
    }
    total += buf.length;
    if (buf.length === 0 || total > 30_000_000) continue; // ~30MB total guard
    // Guard the write: one bad input (e.g. an un-writable name) must not abort an
    // otherwise-valid run.
    try {
      await writeFile(path.join(dir, name), buf);
      written.add(name);
    } catch {
      continue;
    }
  }
  return written;
}

// Collect files the program wrote to its workspace (everything except the source
// file and any seeded input files) and return them base64 so the app can store +
// serve them to chat.
async function collectArtifacts(dir, userFile, inputNames = new Set()) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const files = [];
  for (const name of entries) {
    if (name === userFile || inputNames.has(name) || files.length >= ART_MAX_FILES) continue;
    try {
      const s = await stat(path.join(dir, name));
      if (!s.isFile() || s.size === 0 || s.size > ART_MAX_BYTES) continue;
      const buf = await readFile(path.join(dir, name));
      files.push({ name, mime: mimeFor(name), sizeBytes: buf.length, dataBase64: buf.toString("base64") });
    } catch {
      /* skip unreadable entries */
    }
  }
  return files;
}

async function runOnce(input) {
  const rt = RUNTIMES[input.language];
  if (!rt) return errorReport(`unsupported language: ${input.language}`);

  const work = await mkdtemp(path.join(tmpdir(), "run-"));
  try {
    await writeFile(path.join(work, rt.userFile), String(input.code ?? ""), "utf8");
    // Seed user-uploaded inputs into the workspace before the program runs.
    const inputNames = await writeInputFiles(work, input.inputFiles, rt.userFile);

    const memKb = Math.max(64, Math.floor(Number(input.memoryMb ?? 256))) * 1024;
    const wallMs = Math.min(Math.max(Number(input.timeoutMs ?? 20_000), 1_000), 60_000);
    const maxOut = Math.max(1_024, Number(input.maxOutputBytes ?? 64_000));

    // bash runs its user.sh directly; python/js run through their harness.
    const target = rt.noHarness ? path.join(work, rt.userFile) : rt.harness;
    // ulimit caps address space (anti-OOM), process count (anti-fork-bomb), and
    // file size; the child gets only the broker url + run token (+ a mode-scoped
    // proxy URL, when set below) — never any host secret.
    const shellCmd = `ulimit -v ${memKb}; ulimit -u 256; ulimit -f 1048576; exec ${rt.cmd} ${JSON.stringify(target)}`;
    // The proxy address is per-MODE, not per-run — both SANDBOX_DATA_PROXY_URL and
    // SANDBOX_NET_PROXY_URL are always present (baked into the MicroVM image; see
    // code-exec-stack.ts), but only the one matching THIS run's mode is forwarded
    // into the child as HTTPS_PROXY/HTTP_PROXY. Defense in depth either way: the
    // egress connector for DATA-mode runs has no network path to the NET proxy (or
    // vice versa), so even a wrongly-forwarded proxy URL would just fail to connect.
    const proxyUrl = input.mode === "NET" ? process.env.SANDBOX_NET_PROXY_URL : process.env.SANDBOX_DATA_PROXY_URL;
    const child = spawn("/bin/sh", ["-c", shellCmd], {
      cwd: work,
      env: {
        PATH: process.env.PATH,
        HOME: work,
        USER_FILE: path.join(work, rt.userFile),
        SANDBOX_BROKER_URL: input.brokerUrl ?? "",
        SANDBOX_RUN_TOKEN: input.runToken ?? "",
        ...(proxyUrl ? { HTTPS_PROXY: proxyUrl, HTTP_PROXY: proxyUrl } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true, // own process group, so killGroup() reaps backgrounded children
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
        killGroup(child);
      }
    });
    child.stderr.on("data", (buf) => {
      if (stderr.length < maxOut) stderr += buf.toString("utf8");
    });

    const timer = setTimeout(() => {
      killedForTimeout = true;
      killGroup(child);
    }, wallMs);

    const exitCode = await new Promise((resolve) => child.on("close", resolve));
    clearTimeout(timer);
    const durationMs = Date.now() - started;
    const files = await collectArtifacts(work, rt.userFile, inputNames);

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
    if (meta?.status === "error") return { status: "error", stdout, files, durationMs, exitCode, error: meta.error ?? { message: "error" }, truncated };
    if (!meta && exitCode !== 0) return { ...errorReport(stderr.slice(0, 2_000) || `exited with code ${exitCode}`), stdout, durationMs, exitCode, truncated };
    return { status: "ok", stdout, result: meta ? meta.result : null, files, durationMs, exitCode, truncated };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

http
  .createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
    if (req.method !== "POST" || req.url !== "/run") return send(res, 404, { error: "not found" });

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
