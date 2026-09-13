import type { FormatCallback } from "html-to-text";
import type { IncomingMessage, RequestOptions } from "node:http";
import type { TcpSocketConnectOpts } from "node:net";

import { compile } from "html-to-text";
import { lookup as lookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

import { parsePublicDomainName, parsePublicPageUrl } from "@/features/wiki/wiki-homepage";

const MAX_BODY_BYTES = 512_000;
const MAX_REDIRECTS = 3;
const MAX_READ_MS = 15_000;
const MAX_RESULT_CHARACTERS = 6_000;
const MAX_LINKS = 12;
const EXTRACTION_LIMIT_MARKER = "[Page extraction limit reached]";
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

export type PublicPageReadFailure =
  | "invalid_url"
  | "outside_domain"
  | "blocked_address"
  | "unavailable"
  | "redirect_limit"
  | "unsupported_content"
  | "too_large"
  | "empty_page"
  | "timeout";

export type PublicPageLink = { url: string; title: string };

export type PublicPageReadResult =
  | {
      ok: true;
      url: string;
      title: string;
      text: string;
      links: PublicPageLink[];
      truncated: boolean;
    }
  | { ok: false; reason: PublicPageReadFailure };

class PublicPageReadError extends Error {
  constructor(readonly reason: PublicPageReadFailure) {
    super(reason);
  }
}

export function isPublicPageAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !IPV4_RESERVED.check(address, "ipv4");
  return family === 6 && IPV6_GLOBAL.check(address, "ipv6") && !IPV6_RESERVED.check(address, "ipv6");
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new PublicPageReadError("timeout"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });

    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

async function requestPage(url: URL, signal: AbortSignal): Promise<IncomingMessage> {
  const addresses = await abortable(lookup(url.hostname, { all: true, verbatim: true }), signal);
  if (
    !addresses.length ||
    addresses.some(({ address, family }) => isIP(address) !== family || !isPublicPageAddress(address))
  )
    throw new PublicPageReadError("blocked_address");
  if (signal.aborted) throw new PublicPageReadError("timeout");

  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const requestOptions: RequestOptions & Pick<TcpSocketConnectOpts, "autoSelectFamily"> = {
      agent: false,
      autoSelectFamily: false,
      family: address.family,
      maxHeaderSize: 16_384,
      signal,
      headers: {
        Accept: "text/html, application/xhtml+xml, text/plain",
        "Accept-Encoding": "identity",
        "User-Agent": "Customermates/1.0 (public website reader)",
      },
      lookup: (_hostname, options, callback) => lookupAddress(address.address, options, callback),
    };
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, requestOptions, resolve);
    request.on("error", reject);
    request.end();
  });
}

async function readBody(response: IncomingMessage, signal: AbortSignal): Promise<string> {
  const encoding = response.headers["content-encoding"]?.trim().toLowerCase();
  if (encoding && encoding !== "identity") throw new PublicPageReadError("unsupported_content");
  const declaredLength = response.headers["content-length"];
  if (declaredLength && Number(declaredLength) > MAX_BODY_BYTES) throw new PublicPageReadError("too_large");

  let size = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of response) {
    if (signal.aborted) throw new PublicPageReadError("timeout");
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) throw new PublicPageReadError("too_large");
    chunks.push(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function cleanText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractPage(body: string, url: string, contentType: string, allowedDomain: string): PublicPageReadResult {
  const links: PublicPageLink[] = [];
  let title = "";
  let linksTruncated = false;
  const formatAnchor: FormatCallback = (element, walk, builder) => {
    let label = "";
    builder.pushWordTransform((word) => {
      label += `${word} `;
      return word;
    });
    walk(element.children ?? [], builder);
    builder.popWordTransform();
    const href: unknown = element.attribs?.href;
    if (typeof href !== "string" || !href.trim()) return;
    try {
      const page = parsePublicPageUrl(new URL(href, url).toString());
      if (
        !page ||
        page.registrableDomain !== allowedDomain ||
        page.url === url ||
        links.some((link) => link.url === page.url)
      )
        return;
      if (links.length >= MAX_LINKS) {
        linksTruncated = true;
        return;
      }
      links.push({
        url: page.url,
        title: cleanText(label).slice(0, 120) || page.url,
      });
    } catch {
      return;
    }
  };
  const formatTitle: FormatCallback = (element) => {
    title = cleanText(element.children?.map((node) => node.data ?? "").join("") ?? "").slice(0, 160);
  };
  const text = cleanText(
    contentType === "text/plain"
      ? body
      : compile({
          wordwrap: false,
          baseElements: { selectors: ["html"], returnDomByDefault: true },
          limits: {
            maxInputLength: MAX_BODY_BYTES,
            maxDepth: 64,
            maxChildNodes: 5_000,
            ellipsis: EXTRACTION_LIMIT_MARKER,
          },
          formatters: { publicAnchor: formatAnchor, pageTitle: formatTitle },
          selectors: [
            { selector: "a", format: "publicAnchor" },
            { selector: "title", format: "pageTitle" },
            { selector: "head", format: "inline" },
            ...["script", "style", "noscript", "template", "img", "svg", "form"].map((selector) => ({
              selector,
              format: "skip",
            })),
            ...["h1", "h2", "h3", "h4", "h5", "h6"].map((selector) => ({
              selector,
              options: { uppercase: false },
            })),
          ],
        })(body),
  );
  if (!text) return { ok: false, reason: "empty_page" };

  const result = {
    ok: true as const,
    url,
    title,
    text,
    links,
    truncated: linksTruncated || text.includes(EXTRACTION_LIMIT_MARKER),
  };
  while (JSON.stringify({ ...result, text: "" }).length > 2_800 && result.links.length) {
    result.links.pop();
    result.truncated = true;
  }
  const available = MAX_RESULT_CHARACTERS - JSON.stringify({ ...result, text: "", truncated: true }).length;
  if (JSON.stringify(text).length - 2 > available) {
    result.text = text.slice(0, Math.max(0, available));
    result.truncated = true;
    while (JSON.stringify(result).length > MAX_RESULT_CHARACTERS) {
      result.text = result.text.slice(
        0,
        Math.max(0, result.text.length - (JSON.stringify(result).length - MAX_RESULT_CHARACTERS)),
      );
    }
  }
  return result;
}

export async function readPublicPage(
  input: { url: string; allowedDomain?: string },
  options: { signal?: AbortSignal } = {},
): Promise<PublicPageReadResult> {
  const firstPage = parsePublicPageUrl(input.url);
  if (!firstPage) return { ok: false, reason: "invalid_url" };
  const allowedDomain =
    input.allowedDomain === undefined ? firstPage.registrableDomain : parsePublicDomainName(input.allowedDomain);
  if (!allowedDomain || firstPage.registrableDomain !== allowedDomain) return { ok: false, reason: "outside_domain" };

  const timeout = AbortSignal.timeout(MAX_READ_MS);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  let currentUrl = firstPage.url;
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const response = await requestPage(new URL(currentUrl), signal);
      try {
        if (REDIRECT_STATUSES.has(response.statusCode ?? 0)) {
          if (redirects === MAX_REDIRECTS) return { ok: false, reason: "redirect_limit" };
          if (!response.headers.location) return { ok: false, reason: "unavailable" };
          const nextPage = parsePublicPageUrl(new URL(response.headers.location, currentUrl).toString());
          if (!nextPage) return { ok: false, reason: "invalid_url" };
          if (nextPage.registrableDomain !== allowedDomain) return { ok: false, reason: "outside_domain" };
          if (new URL(currentUrl).protocol === "https:" && new URL(nextPage.url).protocol !== "https:")
            return { ok: false, reason: "invalid_url" };
          currentUrl = nextPage.url;
          continue;
        }
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300)
          return { ok: false, reason: "unavailable" };
        const contentType = response.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
        if (!contentType || !["text/html", "application/xhtml+xml", "text/plain"].includes(contentType))
          return { ok: false, reason: "unsupported_content" };
        return extractPage(await readBody(response, signal), currentUrl, contentType, allowedDomain);
      } finally {
        response.destroy();
      }
    }
    return { ok: false, reason: "redirect_limit" };
  } catch (error) {
    return {
      ok: false,
      reason: signal.aborted ? "timeout" : error instanceof PublicPageReadError ? error.reason : "unavailable",
    };
  }
}
