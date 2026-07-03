import "dotenv/config";

import { createHmac } from "node:crypto";

const SECRET = process.env.UNIPILE_WEBHOOK_SECRET ?? "";
const DEFAULT_URL = "http://localhost:4000/api/webhooks/unipile/v2";

if (!SECRET) {
  console.error("UNIPILE_WEBHOOK_SECRET is not set");
  process.exit(1);
}

function signState(userId: string): string {
  return `${userId}.${createHmac("sha256", SECRET).update(userId).digest("hex")}`;
}

function signBody(body: string, t: number): string {
  return `t=${t},v0=${createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex")}`;
}

const args = process.argv.slice(2);
const type = args[0];

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const has = (name: string) => args.includes(name);

if (!type || type.startsWith("--")) {
  console.error(
    "usage: tsx ee/scripts/fire-test-webhook.ts <eventType> [--account <id>] [--state <userId>] [--payload <json>] [--url <url>] [--bad-sig] [--bad-json] [--skew <seconds>]",
  );
  process.exit(1);
}

const envelope: Record<string, unknown> = { type };
const account = flag("--account");
const stateUser = flag("--state");
const payloadJson = flag("--payload");
if (account) envelope.account_id = account;
if (stateUser) envelope.state = signState(stateUser);
if (payloadJson) envelope.payload = JSON.parse(payloadJson);

let body = JSON.stringify(envelope);
if (has("--bad-json")) body = body.slice(0, -1);

const t = Math.floor(Date.now() / 1000) + Number(flag("--skew") ?? 0);
const signature = has("--bad-sig") ? `t=${t},v0=00deadbeef` : signBody(body, t);
const url = flag("--url") ?? DEFAULT_URL;

const response = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", "unipile-signature": signature },
  body,
});

const text = await response.text();
console.log(`[${type}] -> ${url}`);
console.log(`status=${response.status} body=${text}`);
