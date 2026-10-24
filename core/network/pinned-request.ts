import type { LookupAddress } from "node:dns";
import type { IncomingMessage, RequestOptions } from "node:http";
import type { TcpSocketConnectOpts } from "node:net";

import { lookup as lookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import { isPublicIpAddress } from "./public-ip-address";

export type PinnedRequestFailure = "blocked" | "timeout" | "unavailable" | "unsupported_content" | "too_large";

export type ResolveHost = (hostname: string) => Promise<LookupAddress[]>;

const FAILURES: readonly PinnedRequestFailure[] = [
  "blocked",
  "timeout",
  "unavailable",
  "unsupported_content",
  "too_large",
];

export function pinnedRequestError(reason: PinnedRequestFailure): Error {
  return new Error("Outbound request failed.", { cause: { kind: "pinnedRequest", reason } });
}

export function pinnedRequestFailure(error: unknown): PinnedRequestFailure | null {
  const cause = error instanceof Error ? (error.cause as { kind?: unknown; reason?: unknown } | undefined) : undefined;
  return cause?.kind === "pinnedRequest" ? (FAILURES.find((failure) => failure === cause.reason) ?? null) : null;
}

export function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(pinnedRequestError("timeout"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

export function bareHostname(url: URL): string {
  return url.hostname
    .replace(/^\[(.*)\]$/u, "$1")
    .replace(/\.$/u, "")
    .toLowerCase();
}

function resolveHost(hostname: string): Promise<LookupAddress[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

export async function pinnedAddress(
  hostname: string,
  {
    signal,
    allowPrivate = false,
    resolve = resolveHost,
  }: { signal: AbortSignal; allowPrivate?: boolean; resolve?: ResolveHost },
): Promise<LookupAddress> {
  const family = isIP(hostname);
  const addresses = family ? [{ address: hostname, family }] : await abortable(resolve(hostname), signal);
  if (
    !addresses.length ||
    addresses.some(({ address, family }) => isIP(address) !== family || (!allowPrivate && !isPublicIpAddress(address)))
  )
    throw pinnedRequestError("blocked");
  if (signal.aborted) throw pinnedRequestError("timeout");
  return addresses[0];
}

export function sendPinnedRequest(
  url: URL,
  address: LookupAddress,
  { signal, accept, userAgent }: { signal: AbortSignal; accept: string; userAgent: string },
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const options: RequestOptions & Pick<TcpSocketConnectOpts, "autoSelectFamily"> = {
      agent: false,
      autoSelectFamily: false,
      family: address.family,
      maxHeaderSize: 16_384,
      signal,
      headers: {
        Accept: accept,
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

export async function readCappedBody(
  response: IncomingMessage,
  { maxBytes, signal, truncate = false }: { maxBytes: number; signal: AbortSignal; truncate?: boolean },
): Promise<{ body: Buffer; truncated: boolean }> {
  const encoding = response.headers["content-encoding"]?.trim().toLowerCase();
  if (encoding && encoding !== "identity") throw pinnedRequestError("unsupported_content");
  const declared = Number(response.headers["content-length"]);
  if (!truncate && Number.isFinite(declared) && declared > maxBytes) throw pinnedRequestError("too_large");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of response) {
    if (signal.aborted) throw pinnedRequestError("timeout");
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (size + buffer.byteLength > maxBytes) {
      if (!truncate) throw pinnedRequestError("too_large");
      const kept = buffer.subarray(0, maxBytes - size);
      chunks.push(new Uint8Array(kept.buffer, kept.byteOffset, kept.byteLength));
      return { body: Buffer.concat(chunks), truncated: true };
    }
    size += buffer.byteLength;
    chunks.push(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  }
  return { body: Buffer.concat(chunks), truncated: false };
}
