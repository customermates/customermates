import { z } from "zod";

import {
  CampaignValueSchema,
  type SearchParams,
  campaignValue,
  decodeJson,
  isSameSite,
  parseHttpUrl,
} from "./signup-parsing";

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

function campaignFrom(read: (param: string) => string | string[] | null | undefined): SignupCampaign | null {
  const campaign = Object.fromEntries(
    CAMPAIGN_FIELDS.map((field) => [field, campaignValue(read(CAMPAIGN_QUERY_PARAMS[field]))]),
  );
  const parsed = SignupCampaignSchema.safeParse(campaign);
  return parsed.success ? parsed.data : null;
}

export function signupCampaignFromRequest(args: {
  searchParams: SearchParams;
  referer: string | null;
  baseUrl: string;
}): SignupCampaign | null {
  const fromSignupLink = campaignFrom((param) => args.searchParams[param]);
  if (fromSignupLink) return fromSignupLink;

  const referrer = parseHttpUrl(args.referer);
  return isSameSite(referrer, args.baseUrl) ? campaignFrom((param) => referrer.searchParams.get(param)) : null;
}

export function encodeSignupCampaign(campaign: SignupCampaign | null | undefined): string | null {
  const parsed = SignupCampaignSchema.safeParse(campaign);
  if (!parsed.success) return null;
  const encoded = JSON.stringify(parsed.data);
  return encoded.length > SIGNUP_CAMPAIGN_MAX_LENGTH ? null : encoded;
}

export function decodeSignupCampaign(value: unknown): SignupCampaign | null {
  if (typeof value !== "string" || value.length > SIGNUP_CAMPAIGN_MAX_LENGTH) return null;
  return decodeJson(SignupCampaignSchema, value);
}

export function readSignupCampaign(value: unknown): SignupCampaign | null {
  const parsed = SignupCampaignSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
