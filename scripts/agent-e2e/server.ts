import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { createConnection } from "node:net";
import { resolve } from "node:path";

const READY_TIMEOUT_MS = 180_000;

export const SERVER_LOG = ".next/agent-e2e-server.log";

function portInUse(port: number) {
  return new Promise<boolean>((resolvePort) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolvePort(true);
    });
    socket.once("error", () => resolvePort(false));
  });
}

export function runBuild(environment: Record<string, string | undefined>) {
  return new Promise<void>((resolveBuild, rejectBuild) => {
    const child = spawn("yarn", ["build"], { stdio: "inherit", env: environment as NodeJS.ProcessEnv });
    child.once("error", rejectBuild);
    child.once("exit", (code) => (code === 0 ? resolveBuild() : rejectBuild(new Error(`yarn build exited ${code}`))));
  });
}

export async function startServer(args: {
  port: number;
  appUrl: string;
  environment: Record<string, string | undefined>;
}): Promise<ChildProcess> {
  if (await portInUse(args.port)) throw new Error(`Port ${args.port} is already in use; stop that process or pass --port.`);
  const log = createWriteStream(resolve(process.cwd(), SERVER_LOG), { flags: "w" });
  const child = spawn(resolve(process.cwd(), "node_modules/.bin/next"), ["start", "-p", String(args.port)], {
    env: args.environment as NodeJS.ProcessEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  let exited: number | null = null;
  child.once("exit", (code) => {
    exited = code ?? -1;
  });
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited !== null) throw new Error(`The server exited with ${exited} during startup; see ${SERVER_LOG}.`);
    try {
      const response = await fetch(`${args.appUrl}/api/agent/messages`, { method: "GET" });
      if (response.status > 0) return child;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
    }
  }
  child.kill("SIGTERM");
  throw new Error(`The server did not answer within ${READY_TIMEOUT_MS / 1000} s; see ${SERVER_LOG}.`);
}

export async function stopServer(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise<boolean>((resolveExit) => child.once("exit", () => resolveExit(true))),
    new Promise<boolean>((resolveTimeout) => setTimeout(() => resolveTimeout(false), 10_000)),
  ]);
  if (!exited) child.kill("SIGKILL");
}
