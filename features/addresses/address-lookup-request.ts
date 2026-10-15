import type { LookupAddress } from "node:dns";
import type { IncomingMessage, RequestOptions } from "node:http";
import type { TcpSocketConnectOpts } from "node:net";

import { lookup as lookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import { isPublicIpAddress } from "@/core/network/public-ip-address";

export type ProviderJsonFailure =
  | "blocked"
  | "timeout"
  | "status"
  | "unavailable"
  | "unsupported_content"
  | "too_large";

export type ProviderJsonResult =
  | { ok: true; body: unknown }
  | { ok: false; reason: ProviderJsonFailure; status?: number };

export type ResolveHost = (hostname: string) => Promise<LookupAddress[]>;

export type ProviderJsonOptions = {
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
  resolve?: ResolveHost;
};

const PRIVATE_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa"];
const JSON_CONTENT_TYPES = new Set(["application/json", "application/geo+json"]);

const FAILURES: readonly ProviderJsonFailure[] = [
  "blocked",
  "timeout",
  "status",
  "unavailable",
  "unsupported_content",
  "too_large",
];

function providerJsonError(reason: ProviderJsonFailure) {
  return new Error("Address provider request failed.", { cause: { kind: "addressProvider", reason } });
}

function providerJsonFailure(error: unknown): ProviderJsonFailure {
  const cause = error instanceof Error ? (error.cause as { kind?: unknown; reason?: unknown } | undefined) : undefined;
  const reason = cause?.kind === "addressProvider" ? FAILURES.find((failure) => failure === cause.reason) : undefined;
  return reason ?? "unavailable";
}

function bareHostname(url: URL): string {
  return url.hostname
    .replace(/^\[(.*)\]$/u, "$1")
    .replace(/\.$/u, "")
    .toLowerCase();
}

export function isOperatorPrivateHost(hostname: string): boolean {
  if (isIP(hostname)) return !isPublicIpAddress(hostname);
  return (
    hostname === "localhost" ||
    !hostname.includes(".") ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(providerJsonError("timeout"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function resolveHost(hostname: string): Promise<LookupAddress[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

async function pinnedAddress(hostname: string, resolve: ResolveHost, signal: AbortSignal): Promise<LookupAddress> {
  const family = isIP(hostname);
  if (family) return { address: hostname, family };
  const addresses = await abortable(resolve(hostname), signal);
  if (!addresses.length || addresses.some(({ address, family }) => isIP(address) !== family))
    throw providerJsonError("unavailable");
  if (!isOperatorPrivateHost(hostname) && addresses.some(({ address }) => !isPublicIpAddress(address)))
    throw providerJsonError("blocked");
  return addresses[0];
}

function send(url: URL, address: LookupAddress, signal: AbortSignal, userAgent: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const options: RequestOptions & Pick<TcpSocketConnectOpts, "autoSelectFamily"> = {
      agent: false,
      autoSelectFamily: false,
      family: address.family,
      maxHeaderSize: 16_384,
      signal,
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "identity",
        "User-Agent": userAgent,
      },
      lookup: (_hostname, lookupOptions, callback) => lookupAddress(address.address, lookupOptions, callback),
    };
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, options, resolve);
    request.on("error", reject);
    request.end();
  });
}

async function readJson(response: IncomingMessage, maxBytes: number, signal: AbortSignal): Promise<unknown> {
  const contentType = (response.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!JSON_CONTENT_TYPES.has(contentType)) throw providerJsonError("unsupported_content");
  const encoding = response.headers["content-encoding"]?.trim().toLowerCase();
  if (encoding && encoding !== "identity") throw providerJsonError("unsupported_content");
  const declared = Number(response.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) throw providerJsonError("too_large");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of response) {
    if (signal.aborted) throw providerJsonError("timeout");
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBytes) throw providerJsonError("too_large");
    chunks.push(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  }
  try {
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch {
    throw providerJsonError("unsupported_content");
  }
}

export async function requestProviderJson(url: URL, options: ProviderJsonOptions): Promise<ProviderJsonResult> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "blocked" };
  const signal = AbortSignal.timeout(options.timeoutMs);
  try {
    const address = await pinnedAddress(bareHostname(url), options.resolve ?? resolveHost, signal);
    const response = await send(url, address, signal, options.userAgent);
    try {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) return { ok: false, reason: "status", status };
      return { ok: true, body: await readJson(response, options.maxBytes, signal) };
    } finally {
      response.destroy();
    }
  } catch (error) {
    if (signal.aborted) return { ok: false, reason: "timeout" };
    return { ok: false, reason: providerJsonFailure(error) };
  }
}
