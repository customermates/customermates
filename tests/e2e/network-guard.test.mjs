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

test("intercepts synthetic email delivery and adoption without accepting other provider requests", async () => {
  process.env.UNIPILE_API_KEY = "e2e-local-provider-no-network";
  const account = "e2e_local_00000000-0000-4000-8000-000000000001";
  const headers = { "X-API-KEY": process.env.UNIPILE_API_KEY, "Content-Type": "application/json" };
  try {
    const response = await fetch(`https://api.unipile.com/v2/${account}/emails/send`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: { email: "sender@example.test" },
        to: [{ email: "recipient@example.test" }],
        subject: "Local delivery",
        html: "<p>Local only</p>",
      }),
    });
    const { id } = await response.json();
    assert.match(id, /^e2e_email_/);
    const stored = await fetch(`https://api.unipile.com/v2/${account}/emails/${id}`, { headers });
    assert.deepEqual((await stored.json()).to, [{ email: "recipient@example.test" }]);
    for (const url of [
      "https://api.unipile.com/v2/real-account/emails/send",
      `https://api.unipile.com/v2/${account}/accounts`,
      `https://api.unipile.com/v2/${account}/emails/send?external=true`,
      `https://api.unipile.com:4433/v2/${account}/emails/send`,
    ])
      assert.throws(() => fetch(url, { method: "POST", headers }), /blocked a non-loopback connection/);
    assert.throws(
      () => fetch(`https://api.unipile.com/v2/${account}/emails/send`, { method: "POST" }),
      /blocked a non-loopback connection/,
    );
    await assert.rejects(
      fetch(`https://api.unipile.com/v2/${account}/emails/send`, {
        method: "POST",
        headers,
        body: JSON.stringify({ from: { email: "sender@example.test" }, to: [{ email: "recipient@example.com" }] }),
      }),
      /synthetic fixture mail/,
    );
  } finally {
    delete process.env.UNIPILE_API_KEY;
  }
});
