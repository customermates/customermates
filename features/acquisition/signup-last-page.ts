import { z } from "zod";

import { TEMPLATE_SLUGS, isTemplateSlug } from "@/core/templates/template-slugs";

export const SIGNUP_LAST_PAGE_MAX_LENGTH = 512;
export const SIGNUP_LAST_PAGE_OPAQUE_SEGMENT = ":id";

const TEMPLATE_QUERY_PREFIX = "template=";
const PAGE_PATTERN = new RegExp(
  `^/(?!/)[^\\s?#\\p{Cc}]*(?:\\?${TEMPLATE_QUERY_PREFIX}(?:${TEMPLATE_SLUGS.join("|")}))?$`,
  "u",
);
const OPAQUE_SEGMENT_PATTERN =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{24,})$/i;

export const SignupLastPageSchema = z.string().max(SIGNUP_LAST_PAGE_MAX_LENGTH).regex(PAGE_PATTERN);

export function isSignupLastPage(value: string): boolean {
  return SignupLastPageSchema.safeParse(value).success;
}

function parseUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function withoutOpaqueSegments(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => (OPAQUE_SEGMENT_PATTERN.test(segment) ? SIGNUP_LAST_PAGE_OPAQUE_SEGMENT : segment))
    .join("/");
}

export function signupLastPageFromReferer(args: { referer: string | null; baseUrl: string }): string | null {
  const referrer = parseUrl(args.referer);
  if (referrer === null || referrer.host !== new URL(args.baseUrl).host) return null;

  const path = withoutOpaqueSegments(referrer.pathname);
  const template = referrer.searchParams.get("template")?.trim().toLowerCase();
  const page = isTemplateSlug(template) ? `${path}?${TEMPLATE_QUERY_PREFIX}${template}` : path;
  return isSignupLastPage(page) ? page : null;
}
