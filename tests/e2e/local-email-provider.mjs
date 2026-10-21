import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const localProviderKey = "e2e-local-provider-no-network";
export const localWebhookSecret = "e2e-local-unipile-webhook-secret";
export const responseLostAfterAcceptance = "[response lost after acceptance]";
export const sentCopyUnavailable = "[sent copy unavailable]";
const emails = new Map();
const syntheticEmail = (value) => typeof value === "string" && /^[^@\s]+@[^@\s]+\.test$/.test(value);

function recordAcceptedEmail(entry) {
  const file = process.env.CRM_E2E_EMAIL_LEDGER;
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(entry)}\n`);
}

export function localEmailRequest(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== "https://api.unipile.com" || process.env.UNIPILE_API_KEY !== localProviderKey) return null;
  const path = url.pathname.match(/^\/v2\/(e2e_local_[a-f0-9-]{36})\/emails\/(send|e2e_email_[a-f0-9-]{36})$/);
  if (!path || url.username || url.password) return null;
  const request = new Request(input, init);
  if (request.headers.get("X-API-KEY") !== localProviderKey || url.search) return null;
  if (path[2] === "send" && request.method === "POST") return sendEmail(request, path[1]);
  if (path[2] !== "send" && request.method === "GET") {
    const email = emails.get(`${path[1]}:${path[2]}`);
    if (!email) throw new Error("Local email transport requires its own accepted delivery");
    if (email.subject.includes(sentCopyUnavailable))
      return Promise.resolve(Response.json({ type: "errors/resource_not_found", status: 404 }, { status: 404 }));
    return Promise.resolve(Response.json(email));
  }
  return null;
}

async function sendEmail(request, accountId) {
  const body = await request.json();
  const recipients = [...(body.to ?? []), ...(body.cc ?? []), ...(body.bcc ?? [])];
  if (
    !syntheticEmail(body.from?.email) ||
    !body.to?.length ||
    !recipients.every((recipient) => syntheticEmail(recipient.email)) ||
    typeof body.subject !== "string" ||
    !body.subject.trim() ||
    typeof body.html !== "string" ||
    !body.html.trim() ||
    body.attachments?.length
  )
    throw new Error("Local email transport accepts synthetic fixture mail without attachments only");
  const id = `e2e_email_${randomUUID()}`;
  const email = {
    id,
    message_id: id,
    thread_id: `e2e_thread_${randomUUID()}`,
    subject: body.subject,
    body: body.html,
    date: new Date().toISOString(),
    from: [body.from],
    to: body.to,
    cc: body.cc ?? [],
    bcc: body.bcc ?? [],
    folders: ["e2e_sent"],
  };
  emails.set(`${accountId}:${id}`, email);
  recordAcceptedEmail({ accountId, id, subject: body.subject, email });
  if (body.subject.includes(responseLostAfterAcceptance))
    return Response.json({ type: "api/proxy_timeout", status: 504, title: "Gateway timeout" }, { status: 504 });
  return Response.json({ id, message_id: id });
}
