// Egress guard for the live draft-send checks (scripts/verify/live-checks.mjs). Loaded with `node --import` into the
// production server. It fails closed:
//   - only loopback and api.unipile.com are reachable; every other host (Resend, Lemon Squeezy, AI gateway, Sentry, ...)
//     is refused at the socket and fetch level;
//   - Unipile reads (GET) pass; an email send passes only from one of the two fixture accounts and only when every
//     to/cc/bcc address is a designated test inbox, matched against the hard-coded hashes in live-allowlist.mjs; every other write
//     (DELETE, PATCH, chat or LinkedIn sends, webhook changes) is answered 403 without leaving the machine.
// Every decision is appended to $CRM_LIVE_SEND_LEDGER without addresses, bodies or headers.
import { appendFileSync } from "node:fs";
import net from "node:net";

import { LOOPBACK, UNIPILE_HOST, unipileDecision } from "./live-allowlist.mjs";

const ledger = process.env.CRM_LIVE_SEND_LEDGER;
const record = (entry) => {
  if (ledger) appendFileSync(ledger, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
};

function refusal(status, reason) {
  return new Response(JSON.stringify({ type: "live-check/blocked", status, title: `Blocked by the live-check guard: ${reason}` }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async function liveGuardedFetch(input, init) {
  const url = new URL(input instanceof Request ? input.url : String(input instanceof URL ? input.href : input));
  if (["data:", "blob:"].includes(url.protocol) || LOOPBACK.has(url.hostname)) return realFetch(input, init);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (url.hostname !== UNIPILE_HOST || url.protocol !== "https:") {
    record({ blocked: "host", method, host: url.hostname });
    return refusal(503, "external host");
  }
  const decision = await unipileDecision(method, url, input, init);
  const path = url.pathname.replace(/acc_[a-z0-9]+/gi, "{account}");
  if (decision) {
    record({ blocked: "unipile", method, path, status: decision.status, reason: decision.reason });
    return refusal(decision.status, decision.reason);
  }
  const response = await realFetch(input, init);
  if (method !== "GET") record({ forwarded: true, method, path, status: response.status });
  return response;
};

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof options === "object" && options ? (options.path ? "localhost" : (options.host ?? options.hostname ?? "localhost")) : typeof args[1] === "string" ? args[1] : "localhost";
  if (!LOOPBACK.has(host) && host !== UNIPILE_HOST && !(typeof options === "object" && options?.servername === UNIPILE_HOST)) {
    record({ blocked: "socket", host });
    throw new Error("The live-check guard blocked a connection to a host other than loopback or api.unipile.com");
  }
  return connect.apply(this, args);
};

