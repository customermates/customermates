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

test("answers Lemon Squeezy checkout, subscription and seat calls locally only with the local key", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const provider = await import("./local-lemonsqueezy-provider.mjs");
  const directory = mkdtempSync(join(tmpdir(), "lemonsqueezy-guard-"));
  const headers = {
    Authorization: `Bearer ${provider.localLemonSqueezyKey}`,
    "Content-Type": "application/vnd.api+json",
  };
  process.env.CRM_E2E_PROVIDER_DIRECTORY = directory;
  try {
    assert.throws(() => fetch("https://api.lemonsqueezy.com/v1/checkouts", { method: "POST", headers }), /blocked/);
    process.env.LEMONSQUEEZY_API_KEY = provider.localLemonSqueezyKey;
    const checkout = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers,
      body: JSON.stringify({
        data: {
          attributes: { checkout_data: { custom: { company_id: "company-1" } } },
          relationships: {
            store: { data: { id: provider.localLemonSqueezyStoreId } },
            variant: { data: { id: provider.localLemonSqueezyVariants.pro } },
          },
        },
      }),
    });
    assert.equal(checkout.status, 201);
    assert.match(
      (await checkout.json()).data.attributes.url,
      /^https:\/\/customermates\.lemonsqueezy\.com\/checkout\/custom\//,
    );
    assert.deepEqual(
      provider.readLocalCheckouts(directory).map((stored) => stored.custom),
      [{ company_id: "company-1" }],
    );
    const { id, itemId } = provider.newLocalSubscriptionIds();
    provider.writeLocalSubscription(directory, {
      id,
      itemId,
      companyId: "company-1",
      quantity: 1,
      attributes: { status: "active" },
    });
    const subscription = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${id}`, { headers });
    assert.equal((await subscription.json()).data.attributes.first_subscription_item.quantity, 1);
    const seats = await fetch(`https://api.lemonsqueezy.com/v1/subscription-items/${itemId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ data: { attributes: { quantity: 3 } } }),
    });
    assert.equal(seats.status, 200);
    assert.deepEqual(provider.readLocalSubscription(directory, id).quantityUpdates, [3]);
    assert.equal((await fetch("https://api.lemonsqueezy.com/v1/subscriptions/123", { headers })).status, 404);
    assert.throws(() => fetch("https://api.lemonsqueezy.com/v1/stores/1", { headers }), /blocked/);
    assert.throws(
      () =>
        fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${id}`, { headers: { Authorization: "Bearer other" } }),
      /blocked/,
    );
  } finally {
    delete process.env.LEMONSQUEEZY_API_KEY;
    delete process.env.CRM_E2E_PROVIDER_DIRECTORY;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("issues local OAuth tokens only to the local clients and only for the PKCE verifier of the code", async () => {
  const { createHash } = await import("node:crypto");
  const provider = await import("./local-oauth-provider.mjs");
  const verifier = "local-verifier-".repeat(4);
  const redirectUri = "http://127.0.0.1:4181/api/auth/callback/google";
  const code = provider.localOAuthCode({
    provider: "google",
    identity: { sub: "1", email: "person@example.test", name: "Local Person" },
    codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
    redirectUri,
  });
  const exchange = (fields) =>
    fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        client_id: provider.localOAuthClients.google.id,
        client_secret: provider.localOAuthClients.google.secret,
        ...fields,
      }),
    });
  assert.throws(() => exchange({}), /blocked a non-loopback connection/);
  Object.assign(process.env, provider.localOAuthEnvironment("google"));
  try {
    const issued = await exchange({});
    assert.equal(issued.status, 200);
    const claims = JSON.parse(Buffer.from((await issued.json()).id_token.split(".")[1], "base64url").toString());
    assert.equal(claims.email, "person@example.test");
    assert.equal(claims.email_verified, true);
    assert.equal((await exchange({ code_verifier: "another-verifier" })).status, 400);
    assert.equal((await exchange({ redirect_uri: "http://127.0.0.1:4181/elsewhere" })).status, 400);
    assert.equal((await exchange({ client_secret: "wrong" })).status, 401);
  } finally {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  }
});
