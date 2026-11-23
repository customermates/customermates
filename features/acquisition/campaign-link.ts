import { SIGNUP_PATH } from "./signup-link";

export const PUBLIC_DEMO_HOST = "demo.customermates.com";

const UTM_PREFIX = "utm_";
const MAX_VALUE_LENGTH = 200;
const LOCALIZED_SIGNUP_PATH = /^\/[a-z]{2}(?:-[a-z]{2})?\/auth\/signup$/iu;

export function campaignParams(search: string): [string, string][] {
  const params = new URLSearchParams(search);
  const pairs: [string, string][] = [];
  for (const [key, value] of params) {
    if (!key.toLowerCase().startsWith(UTM_PREFIX) || !value || value.length > MAX_VALUE_LENGTH) continue;
    if (pairs.some(([existing]) => existing === key)) continue;
    pairs.push([key, value]);
  }
  return pairs;
}

function isSignupPath(pathname: string): boolean {
  return pathname === SIGNUP_PATH || LOCALIZED_SIGNUP_PATH.test(pathname);
}

export function carriesCampaign(target: URL, pageOrigin: string, signupOrigins: readonly string[] = []): boolean {
  if (target.host === PUBLIC_DEMO_HOST) return true;
  const sameSite = target.origin === pageOrigin || signupOrigins.includes(target.origin);
  return sameSite && isSignupPath(target.pathname);
}

export function withCampaignParams(
  href: string,
  pageUrl: string,
  options: { signupOrigins?: readonly string[] } = {},
): string {
  let page: URL;
  let target: URL;
  try {
    page = new URL(pageUrl);
    target = new URL(href, page);
  } catch {
    return href;
  }

  const pairs = campaignParams(page.search);
  if (!pairs.length || !carriesCampaign(target, page.origin, options.signupOrigins)) return href;

  let changed = false;
  for (const [key, value] of pairs) {
    if (target.searchParams.has(key)) continue;
    target.searchParams.set(key, value);
    changed = true;
  }

  return changed ? target.toString() : href;
}
