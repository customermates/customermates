import { execSync } from "node:child_process";

import { parse as parsePostgresConnectionString } from "pg-connection-string";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

let devServerHoldsAppPort: boolean | null = null;

function assertNoDevServerContention() {
  if (process.env.CI || process.env.RUN_AGENT_EVAL === "true") return;

  if (devServerHoldsAppPort === null) {
    devServerHoldsAppPort = false;
    try {
      const pids = execSync("lsof -ti :4105", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      for (const pid of pids.split("\n").filter(Boolean)) {
        const command = execSync(`ps -o command= -p ${pid}`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
        if (command.includes("next")) devServerHoldsAppPort = true;
      }
    } catch {
      devServerHoldsAppPort = devServerHoldsAppPort === true;
    }
  }

  if (devServerHoldsAppPort)
    throw new Error(
      "A dev server holds port 4105, which starves the database suite into phantom timeouts. Stop it before running RUN_DATABASE_TESTS=true.",
    );
}

export function getLocalDatabaseTestUrl(): string | null {
  if (process.env.RUN_DATABASE_TESTS !== "true") return null;

  assertNoDevServerContention();

  const value = process.env.DATABASE_URL;
  if (!value)
    throw new Error("DATABASE_URL is required when RUN_DATABASE_TESTS=true");

  const url = new URL(value);
  const effectiveHost = parsePostgresConnectionString(value).host;
  if (
    !POSTGRES_PROTOCOLS.has(url.protocol) ||
    !LOOPBACK_HOSTNAMES.has(url.hostname) ||
    !effectiveHost ||
    !LOOPBACK_HOSTNAMES.has(effectiveHost)
  )
    throw new Error(
      "DATABASE_URL must point to a local PostgreSQL instance when RUN_DATABASE_TESTS=true",
    );

  return value;
}
