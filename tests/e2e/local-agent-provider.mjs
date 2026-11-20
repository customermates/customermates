import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const localAgentKeyPrefix = "e2e-valid-";
export const localAgentRestrictedKeyPrefix = "e2e-restricted-";
const LISTING_FORBIDDEN = 403;

const PROVIDERS = [
  {
    provider: "anthropic",
    origin: "https://api.anthropic.com",
    path: "/v1/models",
    header: "x-api-key",
    rejected: 401,
    body: { data: [{ type: "model", id: "claude-sonnet-5-5" }], has_more: false },
  },
  {
    provider: "openai",
    origin: "https://api.openai.com",
    path: "/v1/models",
    header: "authorization",
    rejected: 401,
    body: { object: "list", data: [{ id: "gpt-5-mini", object: "model" }] },
  },
  {
    provider: "google",
    origin: "https://generativelanguage.googleapis.com",
    path: "/v1beta/models",
    header: "x-goog-api-key",
    rejected: 400,
    body: { models: [{ name: "models/gemini-2.5-flash" }] },
  },
];

function checksFile(providerDirectory) {
  if (!providerDirectory) throw new Error("The local agent provider requires the run's provider directory");
  const directory = join(providerDirectory, "agent-provider");
  mkdirSync(directory, { recursive: true });
  return join(directory, "checks.jsonl");
}

export function readAgentProviderChecks(providerDirectory) {
  const file = checksFile(providerDirectory);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function keyOf(request, header) {
  const value = request.headers.get(header) ?? "";
  return header === "authorization" ? value.replace(/^Bearer\s+/i, "") : value;
}

export function localAgentProviderRequest(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const target = PROVIDERS.find((candidate) => candidate.origin === url.origin && candidate.path === url.pathname);
  if (!target || url.username || url.password) return null;
  const request = new Request(input, init);
  if (request.method !== "GET" || url.searchParams.has("key")) return null;
  const valid = keyOf(request, target.header).startsWith(localAgentKeyPrefix);
  appendFileSync(
    checksFile(process.env.CRM_E2E_PROVIDER_DIRECTORY),
    `${JSON.stringify({ provider: target.provider, accepted: valid, keyInHeader: Boolean(keyOf(request, target.header)) })}\n`,
  );
  if (keyOf(request, target.header).startsWith(localAgentRestrictedKeyPrefix))
    return Promise.resolve(
      Response.json({ error: { message: "this key may not list models" } }, { status: LISTING_FORBIDDEN }),
    );
  if (!valid)
    return Promise.resolve(
      Response.json({ error: { message: "invalid api key" } }, { status: target.rejected }),
    );
  return Promise.resolve(Response.json(target.body));
}
