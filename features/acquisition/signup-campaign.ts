import { z } from "zod";

export const SIGNUP_CAMPAIGN_MAX_LENGTH = 1_024;

const CAMPAIGN_QUERY_PARAMS = {
  source: "utm_source",
  medium: "utm_medium",
  campaign: "utm_campaign",
  content: "utm_content",
  term: "utm_term",
} as const;
type CampaignField = keyof typeof CAMPAIGN_QUERY_PARAMS;
const CAMPAIGN_FIELDS = Object.keys(CAMPAIGN_QUERY_PARAMS) as CampaignField[];

const CampaignValueSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\p{L}\p{N}._~+\- ]+$/u);

export const SignupCampaignSchema = z
  .strictObject({
    source: CampaignValueSchema.nullable(),
    medium: CampaignValueSchema.nullable(),
    campaign: CampaignValueSchema.nullable(),
    content: CampaignValueSchema.nullable(),
    term: CampaignValueSchema.nullable(),
  })
  .refine((value) => CAMPAIGN_FIELDS.some((field) => value[field] !== null));
export type SignupCampaign = z.infer<typeof SignupCampaignSchema>;

export const EncodedSignupCampaignSchema = z
  .string()
  .max(SIGNUP_CAMPAIGN_MAX_LENGTH)
  .refine((value) => decodeSignupCampaign(value) !== null);

type SearchParams = Record<string, string | string[] | undefined>;

function campaignValue(value: string | string[] | null | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = CampaignValueSchema.safeParse(candidate?.trim());
  return parsed.success ? parsed.data : null;
}

function campaignFrom(read: (param: string) => string | string[] | null | undefined): SignupCampaign | null {
  const campaign = Object.fromEntries(
    CAMPAIGN_FIELDS.map((field) => [field, campaignValue(read(CAMPAIGN_QUERY_PARAMS[field]))]),
  );
  const parsed = SignupCampaignSchema.safeParse(campaign);
  return parsed.success ? parsed.data : null;
}

function sameSiteReferrer(referer: string | null, baseUrl: string): URL | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return url.host === new URL(baseUrl).host ? url : null;
  } catch {
    return null;
  }
}

export function signupCampaignFromRequest(args: {
  searchParams: SearchParams;
  referer: string | null;
  baseUrl: string;
}): SignupCampaign | null {
  const fromSignupLink = campaignFrom((param) => args.searchParams[param]);
  if (fromSignupLink) return fromSignupLink;

  const referrer = sameSiteReferrer(args.referer, args.baseUrl);
  return referrer ? campaignFrom((param) => referrer.searchParams.get(param)) : null;
}

export function encodeSignupCampaign(campaign: SignupCampaign | null | undefined): string | null {
  const parsed = SignupCampaignSchema.safeParse(campaign);
  if (!parsed.success) return null;
  const encoded = JSON.stringify(parsed.data);
  return encoded.length > SIGNUP_CAMPAIGN_MAX_LENGTH ? null : encoded;
}

export function decodeSignupCampaign(value: unknown): SignupCampaign | null {
  if (typeof value !== "string" || value.length > SIGNUP_CAMPAIGN_MAX_LENGTH) return null;
  try {
    const parsed = SignupCampaignSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function readSignupCampaign(value: unknown): SignupCampaign | null {
  const parsed = SignupCampaignSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
