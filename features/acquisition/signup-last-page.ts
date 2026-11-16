import { z } from "zod";

import { TEMPLATE_SLUGS, isTemplateSlug } from "@/core/templates/template-slugs";

import { SIGNUP_TEMPLATE_QUERY_PARAM } from "./signup-link";
import { isSameSite, parseHttpUrl } from "./signup-parsing";

export const SIGNUP_LAST_PAGE_MAX_LENGTH = 512;
export const SIGNUP_LAST_PAGE_OPAQUE_SEGMENT = ":id";

const TEMPLATE_QUERY_PREFIX = `${SIGNUP_TEMPLATE_QUERY_PARAM}=`;
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

function withoutOpaqueSegments(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => (OPAQUE_SEGMENT_PATTERN.test(segment) ? SIGNUP_LAST_PAGE_OPAQUE_SEGMENT : segment))
    .join("/");
}

export function signupLastPageFromReferer(args: { referer: string | null; baseUrl: string }): string | null {
  const referrer = parseHttpUrl(args.referer);
  if (!isSameSite(referrer, args.baseUrl)) return null;

  const path = withoutOpaqueSegments(referrer.pathname);
  const template = referrer.searchParams.get(SIGNUP_TEMPLATE_QUERY_PARAM)?.trim().toLowerCase();
  const page = isTemplateSlug(template) ? `${path}?${TEMPLATE_QUERY_PREFIX}${template}` : path;
  return isSignupLastPage(page) ? page : null;
}
