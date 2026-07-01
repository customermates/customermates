// JavaScript harness: exposes an async read-only `crm` client to the user
// program, runs it, and prints a sentinel line with {status, result, error}.
// The only reachable network destination is enforced by the network (the DATA/NET
// egress connector + proxy, not this file).
import { readFileSync } from "node:fs";
import { fetch, ProxyAgent, setGlobalDispatcher } from "undici";

const BROKER = process.env.SANDBOX_BROKER_URL || "";
const TOKEN = process.env.SANDBOX_RUN_TOKEN || "";

// Node's global fetch doesn't automatically honor HTTPS_PROXY/HTTP_PROXY (unlike
// Python's urllib, used by harness.py). server.mjs sets one or the other based on
// this run's mode (see runOnce() in server.mjs) — apply it explicitly via undici's
// own dispatcher so this fetch (imported from the SAME undici instance, not the
// global one) actually routes through it.
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl));

async function call(operation, params) {
  const res = await fetch(BROKER, {
    method: "POST",
    headers: { "content-type": "application/json", "x-sandbox-token": TOKEN },
    body: JSON.stringify({ operation, params }),
  });
  const payload = await res.json();
  if (!payload.ok) throw new Error("broker error: " + (payload.error || "unknown"));
  return payload.data;
}

const crm = {
  list: (entity, opts = {}) => call("list", { entity, ...opts }),
  count: (entity, opts = {}) => call("count", { entity, ...opts }),
  search: (searchTerm, opts = {}) => call("search", { searchTerm, ...opts }),
  get: (entity, id) => call("get", { entity, id }),
  configuration: (entity) => call("configuration", { entity }),
  // Invoke a backend tool by name (filter_entity/create_entities/update_entities/
  // delete_entities/…) server-side with the user's permissions. Returns the tool's
  // text output. READ-ONLY by default; mutating tools require the run_code call to set
  // allowWrite:true (else the broker refuses them). Mutations are real — use deliberately.
  run_tool: (name, args = {}) => call("tool", { name, args }),
};

function jsonable(value) {
  try {
    JSON.stringify(value);
    return value ?? null;
  } catch {
    return String(value);
  }
}

const src = readFileSync(process.env.USER_FILE, "utf8");

let result = null;
let status = "ok";
let error = null;

try {
  // `crm` is in scope; the program may use top-level await and assign `result`.
  const run = new Function(
    "crm",
    `return (async () => { let result;\n${src}\n; return typeof result !== "undefined" ? result : undefined; })();`,
  );
  result = await run(crm);
} catch (e) {
  status = "error";
  error = { message: String((e && e.message) || e), traceback: String((e && e.stack) || "") };
}

process.stdout.write("\n__SANDBOX_RESULT__" + JSON.stringify({ status, result: jsonable(result), error }));
