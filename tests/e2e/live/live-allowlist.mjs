// The allowlist of the live checks: the two designated Unipile test inboxes (as salted SHA-256 hashes, so the addresses
// stay out of the repository) and the fixture accounts that own them, plus the decision for every Unipile request.
import { createHash } from "node:crypto";

export const ALLOWLIST_SALT = "customermates-live-check-v1:";
/** sha256(salt + lower-cased address) of the two Unipile test inboxes; nothing else may receive a live email. */
export const TEST_INBOX_HASHES = new Set([
  "341c5e03b00255b08be709c8206e4a3c4837d9b642174de801bb6c7502ecaadf",
  "827f7e75e26d52a03ac3e4cbbf186bab818eb4e46c8e7b75a249db3f2b6333bf",
]);
/** The fixture accounts of the Unipile development application that own those inboxes. */
export const TEST_ACCOUNT_IDS = new Set(["acc_01m42y7hj1ecva9pb0sycgqq51", "acc_01m42y800decva9pbdfk85p4kv"]);
export const UNIPILE_HOST = "api.unipile.com";
export const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function inboxHash(address) {
  return createHash("sha256").update(ALLOWLIST_SALT + String(address).trim().toLowerCase()).digest("hex");
}

export function isTestInbox(address) {
  return TEST_INBOX_HASHES.has(inboxHash(address));
}

function addresses(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => String(typeof item === "string" ? item : (item?.identifier ?? item?.email ?? "")));
}

async function bodyText(input, init) {
  if (input instanceof Request) return input.clone().text();
  if (typeof init?.body === "string") return init.body;
  if (init?.body instanceof URLSearchParams) return init.body.toString();
  if (init?.body instanceof ArrayBuffer || ArrayBuffer.isView(init?.body)) return new TextDecoder().decode(init.body);
  return null;
}

/** Decides an Unipile request; returns null to forward it, or the refusal status and reason. */
export async function unipileDecision(method, url, input, init) {
  if (method === "GET" || method === "HEAD") return null;
  const send = /^\/v2\/([^/]+)\/emails\/send$/.exec(url.pathname) ?? /^\/api\/v1\/emails$/.test(url.pathname);
  if (method !== "POST" || !send) return { status: 403, reason: `${method} ${url.pathname.replace(/acc_[a-z0-9]+/gi, "{account}")} is not allowed` };
  const text = await bodyText(input, init).catch(() => null);
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const account = Array.isArray(send) ? send[1] : body?.account_id;
  const recipients = [...addresses(body?.to), ...addresses(body?.cc), ...addresses(body?.bcc)];
  if (!TEST_ACCOUNT_IDS.has(account)) return { status: 422, reason: "the sending account is not a fixture account" };
  if (recipients.length === 0 || !recipients.every(isTestInbox)) return { status: 422, reason: "a recipient is not a designated test inbox" };
  return null;
}
