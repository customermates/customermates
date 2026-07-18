#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 0 ]]; then
  echo "Usage: yarn test:docker-runtime" >&2
  exit 1
fi

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "Docker must be installed and running." >&2
  exit 1
fi

suffix="$(date +%s)-$$-${RANDOM}"
builder_image="customermates-runtime-builder:${suffix}"
runner_image="customermates-runtime-runner:${suffix}"
network="customermates-runtime-${suffix}"
database_container="customermates-runtime-database-${suffix}"
seed_container="customermates-runtime-seed-${suffix}"
app_container="customermates-runtime-app-${suffix}"
client_container="customermates-runtime-client-${suffix}"

database_user="runtime_e2e"
database_password="runtime-e2e-database-password"
database_name="runtime_e2e"
database_url="postgresql://${database_user}:${database_password}@postgres:5432/${database_name}"
auth_secret="runtime-e2e-auth-secret-000000000000000000000000"
webhook_secret="runtime-e2e-webhook-secret"

cleanup() {
  status=$?
  trap - EXIT INT TERM

  for container in \
    "$client_container" \
    "$app_container" \
    "$seed_container" \
    "$database_container"; do
    docker rm --force "$container" >/dev/null 2>&1 || true
  done

  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm --force "$runner_image" "$builder_image" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Building the self-hosted image..."
docker build --target builder --tag "$builder_image" .
docker build --target runner --tag "$runner_image" .

docker network create --internal --label customermates.runtime-test=true "$network" >/dev/null

docker run \
  --detach \
  --name "$database_container" \
  --network "$network" \
  --network-alias postgres \
  --env "POSTGRES_USER=${database_user}" \
  --env "POSTGRES_PASSWORD=${database_password}" \
  --env "POSTGRES_DB=${database_name}" \
  postgres:16-alpine >/dev/null

database_ready=false
for _ in $(seq 1 60); do
  if docker exec "$database_container" pg_isready --quiet --username "$database_user" --dbname "$database_name"; then
    database_ready=true
    break
  fi

  if [[ "$(docker inspect --format '{{.State.Running}}' "$database_container" 2>/dev/null || true)" != "true" ]]; then
    break
  fi

  sleep 1
done

if [[ "$database_ready" != "true" ]]; then
  echo "The disposable PostgreSQL container did not become ready." >&2
  exit 1
fi

echo "Migrating and seeding the disposable database..."
docker run \
  --name "$seed_container" \
  --network "$network" \
  --env NODE_ENV=development \
  --env APP_MODE=self-hosted \
  --env BASE_URL=http://app:4000 \
  --env "BETTER_AUTH_SECRET=${auth_secret}" \
  --env "DATABASE_URL=${database_url}" \
  "$builder_image" \
  sh -euc 'npx --no-install prisma migrate deploy && npx --no-install prisma db seed'
docker rm "$seed_container" >/dev/null

echo "Starting the self-hosted image through its production command..."
docker run \
  --detach \
  --name "$app_container" \
  --network "$network" \
  --network-alias app \
  --env APP_MODE=self-hosted \
  --env BASE_URL=http://app:4000 \
  --env "BETTER_AUTH_SECRET=${auth_secret}" \
  --env "DATABASE_URL=${database_url}" \
  --env "WORKFLOW_POSTGRES_URL=${database_url}" \
  --env WORKFLOW_TARGET_WORLD=@workflow/world-postgres \
  "$runner_image" >/dev/null

client_program=""
IFS= read -r -d '' client_program <<'NODE' || true
const crypto = require("node:crypto");
const http = require("node:http");
const { Pool } = require("pg");

const appUrl = process.env.APP_URL;
const databaseUrl = process.env.DATABASE_URL;
const webhookSecret = process.env.WEBHOOK_SECRET;
if (!appUrl || !databaseUrl || !webhookSecret) throw new Error("Test configuration is incomplete");

const pool = new Pool({ connectionString: databaseUrl });
const receiverUrl = "http://receiver:8787";
const state = { attempts: 0, invalid: 0, entityId: null };

const server = http.createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/webhook") {
    response.writeHead(404).end();
    return;
  }

  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    state.attempts += 1;
    const body = Buffer.concat(chunks);
    const signature = crypto.createHmac("sha256", webhookSecret).update(body).digest("hex");
    const payload = JSON.parse(body.toString("utf8"));
    const entityId = payload?.data?.entityId;
    const valid =
      request.headers["x-webhook-signature"] === signature &&
      payload?.event === "contact.created" &&
      payload?.data?.payload?.id === entityId &&
      payload?.data?.payload?.firstName === "Webhook Runtime";

    state.entityId = entityId;
    if (!valid) state.invalid += 1;
    response.writeHead(!valid ? 422 : state.attempts < 3 ? 500 : 204).end();
  });
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function poll(label, check, timeoutMilliseconds = 180_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(500);
  }
  throw new Error(`${label} timed out`);
}

function requireStatus(response, expected, label) {
  if (response.status !== expected) throw new Error(`${label} returned HTTP ${response.status}`);
}

async function main() {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(8787, "0.0.0.0", resolve);
  });
  await poll(
    "Application readiness",
    async () => {
      try {
        return (await fetch(`${appUrl}/llms.txt`)).ok;
      } catch {
        return false;
      }
    },
    60_000,
  );

  const login = await fetch(`${appUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: appUrl },
    body: JSON.stringify({
      email: "max.bergmann@customermates.com",
      password: "local-demo-password",
      rememberMe: false,
    }),
  });
  requireStatus(login, 200, "Seed user sign-in");

  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
  assert(cookie.includes("app.session_token="), "Seed user sign-in did not return a session cookie");

  async function post(path, body, label) {
    const response = await fetch(`${appUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: appUrl },
      body: JSON.stringify(body),
    });
    requireStatus(response, 201, label);
    return response.json();
  }

  await post(
    "/api/v1/webhooks",
    {
      url: `${receiverUrl}/webhook`,
      events: ["contact.created"],
      secret: webhookSecret,
      enabled: true,
    },
    "Webhook creation",
  );
  const contact = await post(
    "/api/v1/contacts",
    { firstName: "Webhook Runtime", lastName: "Test", notes: null },
    "Contact creation",
  );

  await poll("Signed webhook retries", () => Promise.resolve(state.attempts >= 3));

  await poll("Webhook delivery persistence", async () => {
    const result = await pool.query(
      `SELECT status::text AS status,
              "statusCode" AS status_code,
              success,
              ("deliveredAt" IS NOT NULL) AS delivered
         FROM "WebhookDelivery"
        WHERE url = $1
          AND "requestBody" #>> '{data,entityId}' = $2
        ORDER BY "createdAt" DESC
        LIMIT 1`,
      [`${receiverUrl}/webhook`, contact.id],
    );
    const delivery = result.rows[0];
    return (
      delivery?.status === "success" &&
      delivery.status_code === 204 &&
      delivery.success === true &&
      delivery.delivered === true
    );
  });
  assert(state.attempts === 3, "Webhook did not stop after the successful third attempt");
  assert(state.invalid === 0, "Webhook signature or payload was invalid");
  assert(state.entityId === contact.id, "Webhook did not contain the created contact");
}

main()
  .catch((error) => {
    console.error(`Self-hosted webhook E2E failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  });
NODE

docker run \
  --name "$client_container" \
  --network "$network" \
  --network-alias receiver \
  --env APP_URL=http://app:4000 \
  --env "DATABASE_URL=${database_url}" \
  --env "WEBHOOK_SECRET=${webhook_secret}" \
  "$runner_image" \
  node --input-type=commonjs --eval "$client_program"

if [[ "$(docker inspect --format '{{.State.Running}}' "$app_container")" != "true" ]]; then
  echo "The self-hosted application exited during the webhook test." >&2
  exit 1
fi

if docker logs "$app_container" 2>&1 | grep -q "workflow world.start() failed"; then
  echo "The self-hosted workflow worker reported a startup failure." >&2
  exit 1
fi

echo "Self-hosted webhook E2E passed (signed payload, retry, and persisted success)."
