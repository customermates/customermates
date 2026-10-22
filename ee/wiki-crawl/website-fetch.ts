import type { IncomingMessage } from "node:http";

import { parsePublicPageUrl } from "@/features/wiki/wiki-homepage";
import {
  abortable,
  bareHostname,
  pinnedAddress,
  pinnedRequestFailure,
  readCappedBody,
  sendPinnedRequest,
} from "@/core/network/pinned-request";

const MAX_BODY_BYTES = 512_000;
const MAX_REDIRECTS = 3;
const MAX_READ_MS = 15_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type WebsiteFetchFailure =
  | "invalid_url"
  | "outside_domain"
  | "blocked_address"
  | "unavailable"
  | "redirect_limit"
  | "unsupported_content"
  | "too_large"
  | "timeout"
  | "robots";

function websiteFetchFailureReason(error: unknown): WebsiteFetchFailure | null {
  const reason = pinnedRequestFailure(error);
  return reason === "blocked" ? "blocked_address" : reason;
}

async function requestPage(
  url: URL,
  signal: AbortSignal,
  accept: readonly string[],
  userAgent: string,
): Promise<IncomingMessage> {
  const address = await pinnedAddress(bareHostname(url), { signal });
  return sendPinnedRequest(url, address, { signal, accept: accept.join(", "), userAgent });
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

type WebsiteResourceResult =
  | { ok: true; url: string; contentType: string; body: string; truncated: boolean }
  | { ok: false; reason: WebsiteFetchFailure; status?: number };

function websiteResourceTarget(value: string): WebsiteResourceTarget | null {
  const page = parsePublicPageUrl(value);
  return page ? { ...page, host: new URL(page.url).hostname } : null;
}

export async function fetchWebsiteResource(
  input: {
    url: string;
    allows: (target: WebsiteResourceTarget) => boolean;
    allowsRead?: (target: WebsiteResourceTarget) => Promise<boolean>;
    accept: readonly string[];
    userAgent: string;
    truncateOversized?: boolean;
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
      const target = websiteResourceTarget(currentUrl);
      if (!target) return { ok: false, reason: "invalid_url" };
      if (input.allowsRead && !(await abortable(input.allowsRead(target), signal)))
        return { ok: false, reason: "robots" };
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
        const read = await readCappedBody(response, {
          maxBytes: MAX_BODY_BYTES,
          signal,
          truncate: input.truncateOversized === true,
        });
        const body = decodeBody(read.body, contentType, contentTypeHeader);
        return { ok: true, url: currentUrl, contentType, body, truncated: read.truncated };
      } finally {
        response.destroy();
      }
    }
    return { ok: false, reason: "redirect_limit" };
  } catch (error) {
    return {
      ok: false,
      reason: signal.aborted ? "timeout" : (websiteFetchFailureReason(error) ?? "unavailable"),
    };
  }
}
