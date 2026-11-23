export const CAMPAIGN_QUERY_PARAMS = {
  source: "utm_source",
  medium: "utm_medium",
  campaign: "utm_campaign",
  content: "utm_content",
  term: "utm_term",
} as const;

export const CAMPAIGN_VALUE_MAX_LENGTH = 128;
export const CAMPAIGN_VALUE_PATTERN = /^[\p{L}\p{N}._~+\- ]+$/u;

export function isCampaignValue(value: string): boolean {
  return value.length >= 1 && value.length <= CAMPAIGN_VALUE_MAX_LENGTH && CAMPAIGN_VALUE_PATTERN.test(value);
}
