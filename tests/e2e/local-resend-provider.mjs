import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const localResendKey = "e2e-local-resend-no-network";
export const localResendSender = "mail@customermates.test";

const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const SENDER = /^(?:[^<>]+ <[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;

export function localResendEnvironment() {
  return { RESEND_API_KEY: localResendKey, RESEND_OPERATOR_EMAIL: localResendSender };
}

function mailDirectory(providerDirectory) {
  if (!providerDirectory) throw new Error("The local Resend provider requires its run directory");
  const directory = join(providerDirectory, "resend", "emails");
  mkdirSync(directory, { recursive: true });
  return directory;
}

export function readLocalEmails(providerDirectory) {
  const directory = mailDirectory(providerDirectory);
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(directory, name), "utf8")))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

function reply(status, body) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

async function sendEmail(request, providerDirectory) {
  const body = await request.json().catch(() => null);
  const to = typeof body?.to === "string" ? [body.to] : Array.isArray(body?.to) ? body.to : [];
  if (
    typeof body?.from !== "string" ||
    !SENDER.test(body.from) ||
    to.length === 0 ||
    !to.every((address) => typeof address === "string" && ADDRESS.test(address)) ||
    typeof body.subject !== "string" ||
    !body.subject ||
    !((typeof body.html === "string" && body.html) || (typeof body.text === "string" && body.text))
  )
    return reply(422, { statusCode: 422, name: "validation_error", message: "Invalid local e-mail" });
  const idempotencyKey = request.headers.get("idempotency-key");
  const previous = idempotencyKey && readLocalEmails(providerDirectory).find((email) => email.idempotencyKey === idempotencyKey);
  if (previous) {
    if (previous.subject !== body.subject || previous.text !== (body.text ?? null) || previous.html !== (body.html ?? ""))
      return reply(409, { statusCode: 409, name: "invalid_idempotent_request", message: "Idempotency key reused" });
    const path = join(mailDirectory(providerDirectory), `${previous.id}.json`);
    writeFileSync(path, JSON.stringify({ ...previous, attempts: previous.attempts + 1 }, null, 2));
    return reply(200, { id: previous.id });
  }
  const id = randomUUID();
  const email = {
    id,
    createdAt: new Date().toISOString(),
    from: body.from,
    to,
    subject: body.subject,
    html: body.html ?? "",
    text: typeof body.text === "string" ? body.text : null,
    idempotencyKey,
    attempts: 1,
  };
  const path = join(mailDirectory(providerDirectory), `${id}.json`);
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(email, null, 2));
  renameSync(temporary, path);
  return reply(200, { id });
}

export function localResendRequest(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== "https://api.resend.com" || process.env.RESEND_API_KEY !== localResendKey) return null;
  const request = new Request(input, init);
  if (request.headers.get("Authorization") !== `Bearer ${localResendKey}` || url.username || url.password) return null;
  if (request.method === "POST" && url.pathname === "/emails" && !url.search)
    return sendEmail(request, process.env.CRM_E2E_PROVIDER_DIRECTORY);
  return null;
}
