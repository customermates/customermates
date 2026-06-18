import "dotenv/config";

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} in .env`);
    process.exit(1);
  }
  return value;
}

const DSN = requireEnv("UNIPILE_DSN");
const API_KEY = requireEnv("UNIPILE_API_KEY");
const SECRET = requireEnv("UNIPILE_WEBHOOK_SECRET");

const WEBHOOKS = [
  {
    source: "messaging",
    path: "messaging",
    name: "customermates-messaging",
    events: ["message_received", "message_reaction", "message_edited", "message_deleted"],
  },
  {
    source: "email",
    path: "email",
    name: "customermates-email",
    events: ["mail_received", "mail_sent", "mail_moved"],
  },
  {
    source: "account_status",
    path: "account-status",
    name: "customermates-account-status",
    events: [
      "creation_success",
      "creation_fail",
      "deleted",
      "reconnected",
      "sync_success",
      "stopped",
      "ok",
      "connecting",
      "error",
      "credentials",
      "permissions",
    ],
  },
  {
    source: "users",
    path: "relations",
    name: "customermates-users",
    events: ["new_relation"],
  },
  {
    source: "calendar_event",
    path: "calendar",
    name: "customermates-calendar",
    events: ["calendar_event_created", "calendar_event_updated", "calendar_event_deleted"],
  },
] as const;

type WebhookItem = {
  id: string;
  name: string;
  source: string;
  request_url: string;
  headers?: Array<{ key: string; value: string }>;
};

async function listExisting(): Promise<WebhookItem[]> {
  const res = await fetch(`${DSN}/api/v1/webhooks`, {
    headers: { "X-API-KEY": API_KEY },
  });
  if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { items?: WebhookItem[] };
  return data.items ?? [];
}

async function deleteWebhook(id: string): Promise<void> {
  const res = await fetch(`${DSN}/api/v1/webhooks/${id}`, {
    method: "DELETE",
    headers: { "X-API-KEY": API_KEY },
  });
  if (!res.ok && res.status !== 404) throw new Error(`delete ${id} failed: ${res.status} ${await res.text()}`);
}

async function createWebhook(spec: (typeof WEBHOOKS)[number], baseUrl: string, suffix: string): Promise<void> {
  const body = {
    source: spec.source,
    request_url: `${baseUrl}/api/webhooks/unipile/${spec.path}`,
    name: `${spec.name}${suffix}`,
    headers: [{ key: "x-unipile-auth", value: SECRET }],
    format: "json",
    events: spec.events,
  };
  const res = await fetch(`${DSN}/api/v1/webhooks`, {
    method: "POST",
    headers: { "X-API-KEY": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`create ${spec.source} failed: ${res.status} ${await res.text()}`);
  const created = (await res.json()) as { webhook_id: string };
  console.log(`✓ ${spec.source.padEnd(16)} → ${body.request_url}  [id: ${created.webhook_id}]`);
}

function belongsToThisEnv(w: WebhookItem, suffix: string): boolean {
  return w.name.startsWith("customermates-") && w.name.endsWith(suffix);
}

async function verifyHeaders(suffix: string): Promise<void> {
  const items = await listExisting();
  const mine = items.filter((w) => belongsToThisEnv(w, suffix));
  const missing = mine.filter((w) => !(w.headers ?? []).some((h) => h.key.toLowerCase() === "x-unipile-auth"));

  if (mine.length !== WEBHOOKS.length)
    throw new Error(`expected ${WEBHOOKS.length} registrations with suffix ${suffix}, found ${mine.length}`);
  if (missing.length > 0) throw new Error(`x-unipile-auth header missing on: ${missing.map((w) => w.name).join(", ")}`);

  console.log(`\nVerified: ${mine.length} registrations carry the x-unipile-auth header.`);
}

async function main() {
  const rl = createInterface({ input, output });

  const defaultBaseUrl = process.env.BASE_URL?.replace(/\/+$/, "") ?? "";
  const baseUrlAnswer = (await rl.question(`Webhook base URL${defaultBaseUrl ? ` [${defaultBaseUrl}]` : ""}: `)).trim();
  const baseUrl = (baseUrlAnswer || defaultBaseUrl).replace(/\/+$/, "");

  const defaultSuffix = process.env.WEBHOOK_NAME_SUFFIX || "-local";
  const suffixAnswer = (await rl.question(`Registration name suffix [${defaultSuffix}]: `)).trim();
  const suffix = suffixAnswer || defaultSuffix;

  if (!baseUrl) {
    rl.close();
    console.error("A webhook base URL is required.");
    process.exit(1);
  }

  console.log(`\nRegistering ${WEBHOOKS.length} webhooks → ${baseUrl} (suffix ${suffix})`);
  console.log(`Unipile DSN: ${DSN}\n`);

  const existing = await listExisting();
  const toReplace = existing.filter((w) => belongsToThisEnv(w, suffix));
  if (toReplace.length > 0) {
    console.log(
      `These ${toReplace.length} existing registration(s) with suffix ${suffix} will be deleted and recreated:`,
    );
    for (const w of toReplace) console.log(`  - ${w.name} (${w.source})`);
    console.log();
  }

  const proceed = (await rl.question("Proceed? [y/N]: ")).trim().toLowerCase();
  rl.close();
  if (proceed !== "y" && proceed !== "yes") {
    console.log("Aborted.");
    return;
  }

  for (const w of toReplace) {
    console.log(`Deleting ${w.name} (${w.source})`);
    await deleteWebhook(w.id);
  }

  for (const spec of WEBHOOKS) await createWebhook(spec, baseUrl, suffix);

  await verifyHeaders(suffix);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
