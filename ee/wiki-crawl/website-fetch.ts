import type { IncomingMessage, RequestOptions } from "node:http";
import type { TcpSocketConnectOpts } from "node:net";

import { lookup as lookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

import { parsePublicPageUrl } from "@/features/wiki/wiki-homepage";

const MAX_BODY_BYTES = 512_000;
const MAX_REDIRECTS = 3;
const MAX_READ_MS = 15_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const IPV4_RESERVED = new BlockList();
const IPV6_GLOBAL = new BlockList();
const IPV6_RESERVED = new BlockList();

for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  IPV4_RESERVED.addSubnet(address, prefix, "ipv4");

IPV4_RESERVED.addAddress("168.63.129.16", "ipv4");
IPV6_GLOBAL.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3ffe::", 16],
  ["3fff::", 20],
] as const)
  IPV6_RESERVED.addSubnet(address, prefix, "ipv6");

export type WebsiteFetchFailure =
  | "invalid_url"
  | "outside_domain"
  | "blocked_address"
  | "unavailable"
  | "redirect_limit"
  | "unsupported_content"
  | "too_large"
  | "timeout";

class WebsiteFetchError extends Error {
  constructor(readonly reason: WebsiteFetchFailure) {
    super(reason);
  }
}

export function isPublicWebsiteAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !IPV4_RESERVED.check(address, "ipv4");
  return family === 6 && IPV6_GLOBAL.check(address, "ipv6") && !IPV6_RESERVED.check(address, "ipv6");
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new WebsiteFetchError("timeout"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });

    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

async function requestPage(
  url: URL,
  signal: AbortSignal,
  accept: readonly string[],
  userAgent: string,
): Promise<IncomingMessage> {
  const addresses = await abortable(lookup(url.hostname, { all: true, verbatim: true }), signal);
  if (
    !addresses.length ||
    addresses.some(({ address, family }) => isIP(address) !== family || !isPublicWebsiteAddress(address))
  )
    throw new WebsiteFetchError("blocked_address");
  if (signal.aborted) throw new WebsiteFetchError("timeout");

  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const requestOptions: RequestOptions & Pick<TcpSocketConnectOpts, "autoSelectFamily"> = {
      agent: false,
      autoSelectFamily: false,
      family: address.family,
      maxHeaderSize: 16_384,
      signal,
      headers: {
        Accept: accept.join(", "),
        "Accept-Encoding": "identity",
        "User-Agent": userAgent,
      },
      lookup: (_hostname, options, callback) => lookupAddress(address.address, options, callback),
    };
    const request = httpsRequest(url, requestOptions, resolve);
    request.on("error", reject);
    request.end();
  });
}

async function readBody(response: IncomingMessage, signal: AbortSignal): Promise<Buffer> {
  const encoding = response.headers["content-encoding"]?.trim().toLowerCase();
  if (encoding && encoding !== "identity") throw new WebsiteFetchError("unsupported_content");
  const declaredLength = response.headers["content-length"];
  if (declaredLength && Number(declaredLength) > MAX_BODY_BYTES) throw new WebsiteFetchError("too_large");

  let size = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of response) {
    if (signal.aborted) throw new WebsiteFetchError("timeout");
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) throw new WebsiteFetchError("too_large");
    chunks.push(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  }
  return Buffer.concat(chunks);
}

function textDecoder(label: string | undefined): TextDecoder {
  try {
    return new TextDecoder(label?.trim() || "utf-8");
  } catch {
    return new TextDecoder();
  }
}

function byteOrderMarkEncoding(body: Buffer): string | null {
  if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) return "utf-8";
  if (body[0] === 0xfe && body[1] === 0xff) return "utf-16be";
  if (body[0] === 0xff && body[1] === 0xfe) return "utf-16le";
  return null;
}

function decodeBody(body: Buffer, contentType: string, contentTypeHeader: string): string {
  const byteOrderMark = byteOrderMarkEncoding(body);
  if (byteOrderMark) return new TextDecoder(byteOrderMark).decode(body);
  const headerLabel = /;\s*charset\s*=\s*["']?([^"';\s]+)/i.exec(contentTypeHeader)?.[1];
  if (headerLabel || contentType === "text/plain") return textDecoder(headerLabel).decode(body);
  const prefix = body.subarray(0, 1_024).toString("latin1");
  const meta = textDecoder(/<meta\b[^>]*?\bcharset\s*=\s*["']?\s*([^"'\s;/>]+)/i.exec(prefix)?.[1]);
  return (meta.encoding.startsWith("utf-16") ? new TextDecoder() : meta).decode(body);
}

export type WebsiteResourceTarget = { url: string; host: string; registrableDomain: string };

export type WebsiteResourceResult =
  | { ok: true; url: string; contentType: string; body: string }
  | { ok: false; reason: WebsiteFetchFailure; status?: number };

function websiteResourceTarget(value: string): WebsiteResourceTarget | null {
  const page = parsePublicPageUrl(value);
  return page ? { ...page, host: new URL(page.url).hostname } : null;
}

export async function fetchWebsiteResource(
  input: {
    url: string;
    allows: (target: WebsiteResourceTarget) => boolean;
    accept: readonly string[];
    userAgent: string;
  },
  options: { signal?: AbortSignal } = {},
): Promise<WebsiteResourceResult> {
  const first = websiteResourceTarget(input.url);
  if (!first) return { ok: false, reason: "invalid_url" };
  if (!input.allows(first)) return { ok: false, reason: "outside_domain" };

  const timeout = AbortSignal.timeout(MAX_READ_MS);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  let currentUrl = first.url;
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const response = await requestPage(new URL(currentUrl), signal, input.accept, input.userAgent);
      try {
        if (REDIRECT_STATUSES.has(response.statusCode ?? 0)) {
          if (redirects === MAX_REDIRECTS) return { ok: false, reason: "redirect_limit" };
          if (!response.headers.location) return { ok: false, reason: "unavailable" };
          const next = websiteResourceTarget(new URL(response.headers.location, currentUrl).toString());
          if (!next) return { ok: false, reason: "invalid_url" };
          if (!input.allows(next)) return { ok: false, reason: "outside_domain" };
          currentUrl = next.url;
          continue;
        }
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300)
          return { ok: false, reason: "unavailable", status: response.statusCode };
        const contentTypeHeader = response.headers["content-type"] ?? "";
        const contentType = contentTypeHeader.split(";", 1)[0].trim().toLowerCase();
        if (!input.accept.includes(contentType)) return { ok: false, reason: "unsupported_content" };
        const body = decodeBody(await readBody(response, signal), contentType, contentTypeHeader);
        return { ok: true, url: currentUrl, contentType, body };
      } finally {
        response.destroy();
      }
    }
    return { ok: false, reason: "redirect_limit" };
  } catch (error) {
    return {
      ok: false,
      reason: signal.aborted ? "timeout" : error instanceof WebsiteFetchError ? error.reason : "unavailable",
    };
  }
}
