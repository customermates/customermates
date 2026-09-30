import { strict as assert } from "node:assert";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";
import net from "node:net";

Object.assign(process.env, {
  CRM_LOCAL_TEST_TRANSPORT: "true",
  BASE_URL: "http://127.0.0.1:4181",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:22038/crm_e2e",
  DIRECT_URL: "postgresql://postgres:postgres@127.0.0.1:22038/crm_e2e",
  WORKFLOW_LOCAL_BASE_URL: "http://127.0.0.1:4181",
});
await import("./network-guard.mjs");

test("blocks external fetch, HTTP, HTTPS, TCP, and credentials disguised as a loopback host", () => {
  for (const request of [
    () => fetch("https://example.invalid/private"),
    () => fetch(new Request("http://example.invalid/private")),
    () => fetch("https://127.0.0.1@example.invalid/private"),
    () => http.get("http://example.invalid"),
    () => https.request({ hostname: "example.invalid" }),
    () => net.connect({ host: "example.invalid", port: 443 }),
    () => new net.Socket().connect(443, "example.invalid"),
  ])
    assert.throws(request, /blocked a non-loopback connection/);
});

test("allows actual loopback requests", async () => {
  const server = http.createServer((_request, response) => response.end("local"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}`);
    assert.equal(await response.text(), "local");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("fails closed when an inherited environment is not isolated", () => {
  const guard = fileURLToPath(new URL("./network-guard.mjs", import.meta.url));
  for (const change of [
    { CRM_LOCAL_TEST_TRANSPORT: "false" },
    { DATABASE_URL: "postgresql://postgres:postgres@example.invalid/crm_e2e" },
    { DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:22038/customermates" },
  ]) {
    const result = spawnSync(process.execPath, ["--import", guard, "--eval", "process.exit(0)"], {
      env: { ...process.env, ...change },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
  }
});
