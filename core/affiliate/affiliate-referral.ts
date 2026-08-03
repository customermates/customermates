export const AFFILIATE_REFERRAL_COOKIE = "aff_ref";
export const AFFILIATE_REFERRAL_PARAM = "aff";
export const AFFILIATE_REFERRAL_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const REFERRAL_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function readAffiliateReferral(url: URL): string | null {
  const referral = url.searchParams.get(AFFILIATE_REFERRAL_PARAM);
  if (!referral || !REFERRAL_PATTERN.test(referral)) return null;
  return referral;
}

export function withAffiliateReferral(checkoutUrl: string, referral: string | null): string {
  if (!referral) return checkoutUrl;

  const url = new URL(checkoutUrl);
  url.searchParams.set(AFFILIATE_REFERRAL_COOKIE, referral);
  return url.toString();
}
