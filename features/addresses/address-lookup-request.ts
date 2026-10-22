import type { IncomingMessage } from "node:http";
import type { PinnedRequestFailure, ResolveHost } from "@/core/network/pinned-request";

import { isIP } from "node:net";

import {
  bareHostname,
  pinnedAddress,
  pinnedRequestError,
  pinnedRequestFailure,
  readCappedBody,
  sendPinnedRequest,
} from "@/core/network/pinned-request";
import { isPublicIpAddress } from "@/core/network/public-ip-address";

type ProviderJsonFailure = PinnedRequestFailure | "status";

export type ProviderJsonResult =
  | { ok: true; body: unknown }
  | { ok: false; reason: ProviderJsonFailure; status?: number };

export type ProviderFileResult =
  | { ok: true; body: Buffer }
  | { ok: false; reason: ProviderJsonFailure; status?: number };

type ProviderRequestOptions = {
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
  resolve?: ResolveHost;
};

type ProviderRead<T> = (response: IncomingMessage, signal: AbortSignal) => Promise<T>;

const PRIVATE_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa"];
const JSON_CONTENT_TYPES: ReadonlySet<string> = new Set(["application/json", "application/geo+json"]);

export function isOperatorPrivateHost(hostname: string): boolean {
  if (isIP(hostname)) return !isPublicIpAddress(hostname);
  return (
    hostname === "localhost" ||
    !hostname.includes(".") ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

async function readBody(
  response: IncomingMessage,
  maxBytes: number,
  signal: AbortSignal,
  contentTypes: ReadonlySet<string>,
): Promise<Buffer> {
  const contentType = (response.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!contentTypes.has(contentType)) throw pinnedRequestError("unsupported_content");
  return (await readCappedBody(response, { maxBytes, signal })).body;
}

async function requestProvider<T>(
  url: URL,
  options: ProviderRequestOptions,
  accept: string,
  read: ProviderRead<T>,
): Promise<{ ok: true; value: T } | { ok: false; reason: ProviderJsonFailure; status?: number }> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "blocked" };
  const signal = AbortSignal.timeout(options.timeoutMs);
  try {
    const hostname = bareHostname(url);
    const address = await pinnedAddress(hostname, {
      signal,
      allowPrivate: isOperatorPrivateHost(hostname),
      resolve: options.resolve,
    });
    const response = await sendPinnedRequest(url, address, { signal, accept, userAgent: options.userAgent });
    try {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) return { ok: false, reason: "status", status };
      return { ok: true, value: await read(response, signal) };
    } finally {
      response.destroy();
    }
  } catch (error) {
    if (signal.aborted) return { ok: false, reason: "timeout" };
    return { ok: false, reason: pinnedRequestFailure(error) ?? "unavailable" };
  }
}

export async function requestProviderJson(url: URL, options: ProviderRequestOptions): Promise<ProviderJsonResult> {
  const result = await requestProvider(url, options, "application/json", async (response, signal) => {
    const body = await readBody(response, options.maxBytes, signal, JSON_CONTENT_TYPES);
    try {
      return JSON.parse(new TextDecoder().decode(body)) as unknown;
    } catch {
      throw pinnedRequestError("unsupported_content");
    }
  });
  return result.ok ? { ok: true, body: result.value } : result;
}

export async function requestProviderFile(
  url: URL,
  options: ProviderRequestOptions & { contentTypes: ReadonlySet<string> },
): Promise<ProviderFileResult> {
  const result = await requestProvider(url, options, "*/*", (response, signal) =>
    readBody(response, options.maxBytes, signal, options.contentTypes),
  );
  return result.ok ? { ok: true, body: result.value } : result;
}
