import { z } from "zod";

import {
  OnboardingJobSchema,
  SIGNUP_JOB_QUERY_PARAM,
  parseOnboardingJob,
} from "@/features/onboarding-funnel/onboarding-job";

export const SIGNUP_JOURNEY_COOKIE_NAME = "cm_signup_journey";
export const SIGNUP_JOURNEY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24;
export const SIGNUP_LANDING_FALLBACK_PATH = "/auth/signup";

const SIGNUP_JOURNEY_COOKIE_MAX_BYTES = 2_048;
const UTM_QUERY_PARAMS = { utmSource: "utm_source", utmMedium: "utm_medium", utmCampaign: "utm_campaign" } as const;

const LandingPathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^\/[^\s?#\p{Cc}]*$/u);
const ReferrerHostSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u);
const CampaignValueSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\p{L}\p{N}._~+\- ]+$/u);

const MarketingFieldsSchema = z.object({
  referrerHost: ReferrerHostSchema.nullable(),
  utmSource: CampaignValueSchema.nullable(),
  utmMedium: CampaignValueSchema.nullable(),
  utmCampaign: CampaignValueSchema.nullable(),
});

export const SignupJourneyInputSchema = MarketingFieldsSchema.extend({
  job: OnboardingJobSchema.nullable(),
  landingPath: LandingPathSchema,
});
export type SignupJourneyInput = z.infer<typeof SignupJourneyInputSchema>;

export const SignupJourneySchema = SignupJourneyInputSchema.extend({ capturedAt: z.iso.datetime() });
export type SignupJourney = z.infer<typeof SignupJourneySchema>;

export const RegistrationSignupSourceSchema = SignupJourneyInputSchema.extend({
  marketingConsentedAt: z.date().nullable(),
  capturedAt: z.date(),
});
export type RegistrationSignupSource = z.infer<typeof RegistrationSignupSourceSchema>;

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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

function campaignValue(value: string | string[] | undefined): string | null {
  const parsed = CampaignValueSchema.safeParse(firstValue(value)?.trim());
  return parsed.success ? parsed.data : null;
}

function landingPath(pathname: string): string {
  const parsed = LandingPathSchema.safeParse(pathname);
  return parsed.success ? parsed.data : SIGNUP_LANDING_FALLBACK_PATH;
}

function referrerHost(url: URL): string | null {
  const parsed = ReferrerHostSchema.safeParse(url.hostname.toLowerCase());
  return parsed.success ? parsed.data : null;
}

export function signupJourneyFromRequest(args: {
  searchParams: SearchParams;
  referer: string | null;
  baseUrl: string;
}): SignupJourneyInput {
  const referrer = parseUrl(args.referer);
  const ownHost = new URL(args.baseUrl).host;
  const sameSite = referrer !== null && referrer.host === ownHost;

  return {
    job: parseOnboardingJob(args.searchParams[SIGNUP_JOB_QUERY_PARAM]),
    landingPath: sameSite ? landingPath(referrer.pathname) : SIGNUP_LANDING_FALLBACK_PATH,
    referrerHost: referrer && !sameSite ? referrerHost(referrer) : null,
    utmSource: campaignValue(args.searchParams[UTM_QUERY_PARAMS.utmSource]),
    utmMedium: campaignValue(args.searchParams[UTM_QUERY_PARAMS.utmMedium]),
    utmCampaign: campaignValue(args.searchParams[UTM_QUERY_PARAMS.utmCampaign]),
  };
}

export function withoutMarketingFields<T extends SignupJourneyInput>(journey: T): T {
  return { ...journey, referrerHost: null, utmSource: null, utmMedium: null, utmCampaign: null };
}

function hasMarketingFields(journey: SignupJourneyInput): boolean {
  return Boolean(journey.referrerHost || journey.utmSource || journey.utmMedium || journey.utmCampaign);
}

export function nextSignupJourney(args: {
  existing: SignupJourney | null;
  input: SignupJourneyInput;
  marketingConsent: boolean;
  now: Date;
}): SignupJourney {
  const job = args.input.job ?? args.existing?.job ?? null;
  const firstTouch = args.existing ?? { ...args.input, capturedAt: args.now.toISOString() };
  const journey = { ...firstTouch, job };
  return args.marketingConsent ? journey : withoutMarketingFields(journey);
}

export function signupSourceForRegistration(
  journey: SignupJourney,
  marketingConsentedAt: Date | null,
): RegistrationSignupSource {
  const allowed = marketingConsentedAt ? journey : withoutMarketingFields(journey);

  return {
    job: allowed.job,
    landingPath: allowed.landingPath,
    referrerHost: allowed.referrerHost,
    utmSource: allowed.utmSource,
    utmMedium: allowed.utmMedium,
    utmCampaign: allowed.utmCampaign,
    marketingConsentedAt: hasMarketingFields(allowed) ? marketingConsentedAt : null,
    capturedAt: new Date(journey.capturedAt),
  };
}

export function encodeSignupJourneyCookie(journey: SignupJourney): string | null {
  const encoded = Buffer.from(JSON.stringify(SignupJourneySchema.parse(journey))).toString("base64url");
  return Buffer.byteLength(encoded, "utf8") > SIGNUP_JOURNEY_COOKIE_MAX_BYTES ? null : encoded;
}

export function decodeSignupJourneyCookie(value: string | undefined): SignupJourney | null {
  if (!value || Buffer.byteLength(value, "utf8") > SIGNUP_JOURNEY_COOKIE_MAX_BYTES) return null;
  try {
    const parsed = SignupJourneySchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
