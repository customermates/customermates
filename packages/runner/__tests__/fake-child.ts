import type { ChildProcess, SpawnOptions } from "node:child_process";

import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

export type SpawnCall = { command: string; args: readonly string[]; options: SpawnOptions };

export type FakeChild = {
  child: ChildProcess;
  stdinText(): string;
  stdout(...lines: string[]): void;
  stderr(...lines: string[]): void;
  exit(code: number | null): void;
  signals: string[];
};

export function createFakeChild(options: { exitOnSignals?: string[] } = {}): FakeChild {
  const emitter = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  const signals: string[] = [];
  let stdinText = "";
  let ended = false;
  stdin.setEncoding("utf8");
  stdin.on("data", (chunk: string) => {
    stdinText += chunk;
  });

  const finish = (code: number | null) => {
    if (ended) return;
    ended = true;
    stdout.end();
    stderr.end();
    setImmediate(() => emitter.emit("close", code));
  };

  const child = Object.assign(emitter, {
    stdout,
    stderr,
    stdin,
    exitCode: null as number | null,
    signalCode: null as string | null,
    kill: (signal: string = "SIGTERM") => {
      signals.push(signal);
      if ((options.exitOnSignals ?? ["SIGTERM", "SIGKILL"]).includes(signal)) {
        (child as { signalCode: string | null }).signalCode = signal;
        finish(null);
      }
      return true;
    },
  }) as unknown as ChildProcess;

  return {
    child,
    stdinText: () => stdinText,
    stdout: (...lines) => lines.forEach((line) => stdout.write(`${line}\n`)),
    stderr: (...lines) => lines.forEach((line) => stderr.write(`${line}\n`)),
    exit: (code) => {
      (child as { exitCode: number | null }).exitCode = code;
      finish(code);
    },
    signals,
  };
}
