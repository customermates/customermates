import { resolve } from "node:path";

export function localE2eEnvironment() {
  const baseUrl = process.env.CRM_E2E_BASE_URL;
  const databaseUrl = process.env.CRM_E2E_DATABASE_URL;
  if (!baseUrl || !databaseUrl)
    throw new Error("CRM_E2E_BASE_URL and CRM_E2E_DATABASE_URL are required for browser verification.");
  const base = new URL(baseUrl);
  const database = new URL(databaseUrl);
  const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (
    base.protocol !== "http:" ||
    !loopback.has(base.hostname) ||
    !base.port ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  )
    throw new Error("Browser verification requires an explicit loopback HTTP origin and port.");
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !loopback.has(database.hostname) ||
    database.search ||
    !/^\/crm_e2e(?:_[a-z0-9_]+)?$/.test(database.pathname)
  )
    throw new Error(
      "Browser verification requires a dedicated loopback crm_e2e database without connection overrides.",
    );
  return {
    baseUrl: base.origin,
    databaseUrl,
    workflowDirectory: resolve(".runs", "e2e", database.pathname.slice(1), "workflow"),
  };
}
