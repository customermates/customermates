import type { LogFields, Logger } from "./types.js";

import { redactText } from "./redact.js";

type Sink = (line: string) => void;

function render(level: string, message: string, fields: LogFields | undefined, secrets: readonly string[]): string {
  const details = fields
    ? Object.entries(fields)
        .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
        .join(" ")
    : "";
  return redactText(`${new Date().toISOString()} ${level} ${message}${details ? ` ${details}` : ""}`, secrets);
}

export function createLogger(
  secrets: readonly string[],
  sink: Sink = (line) => process.stdout.write(`${line}\n`),
): Logger {
  return {
    info: (message, fields) => sink(render("info", message, fields, secrets)),
    warn: (message, fields) => sink(render("warn", message, fields, secrets)),
    error: (message, fields) => sink(render("error", message, fields, secrets)),
  };
}
