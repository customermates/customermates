import { parse as parsePostgresConnectionString } from "pg-connection-string";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

export function getLocalDatabaseTestUrl(): string | null {
  if (process.env.RUN_DATABASE_TESTS !== "true") return null;

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
