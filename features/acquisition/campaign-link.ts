import { PUBLIC_DEMO_ORIGIN } from "@/components/marketing/product-demo-src";

import { CAMPAIGN_QUERY_PARAMS } from "./signup-campaign";
import { SIGNUP_PATH } from "./signup-link";
import { campaignValue } from "./signup-parsing";

const PUBLIC_DEMO_HOST = new URL(PUBLIC_DEMO_ORIGIN).host;
const CAMPAIGN_KEYS = Object.values(CAMPAIGN_QUERY_PARAMS);
const LOCALIZED_SIGNUP_PATH = /^\/[a-z]{2}(?:-[a-z]{2})?\/auth\/signup$/iu;

export function campaignParams(search: string): [string, string][] {
  const params = new URLSearchParams(search);
  const pairs: [string, string][] = [];
  for (const key of CAMPAIGN_KEYS) {
    const value = campaignValue(params.get(key));
    if (value) pairs.push([key, value]);
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
