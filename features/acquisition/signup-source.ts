import { z } from "zod";

import { TEMPLATE_SLUGS, isTemplateSlug, type TemplateSlug } from "@/core/templates/template-slugs";
import {
  OnboardingJobSchema,
  SIGNUP_JOB_QUERY_PARAM,
  parseOnboardingJob,
} from "@/features/onboarding-funnel/onboarding-job";
import { SignupLastPageSchema, signupLastPageFromReferer } from "./signup-last-page";
import {
  SignupCampaignSchema,
  encodeSignupCampaign,
  signupCampaignFromRequest,
  type SignupCampaign,
} from "./signup-campaign";
import { SIGNUP_PATH, SIGNUP_TEMPLATE_QUERY_PARAM } from "./signup-link";
import {
  CampaignValueSchema,
  type SearchParams,
  campaignValue,
  decodeJson,
  firstValue,
  isSameSite,
  parseHttpUrl,
} from "./signup-parsing";

export const SIGNUP_JOURNEY_COOKIE_NAME = "cm_signup_journey";
export const SIGNUP_JOURNEY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24;

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

const MarketingFieldsSchema = z.object({
  referrerHost: ReferrerHostSchema.nullable(),
  utmSource: CampaignValueSchema.nullable(),
  utmMedium: CampaignValueSchema.nullable(),
  utmCampaign: CampaignValueSchema.nullable(),
});

const TemplateChoiceSchema = z.enum(TEMPLATE_SLUGS);

export const SignupJourneyInputSchema = MarketingFieldsSchema.extend({
  job: OnboardingJobSchema.nullable(),
  landingPath: LandingPathSchema,
  template: TemplateChoiceSchema.nullable().default(null),
});
export type SignupJourneyInput = z.infer<typeof SignupJourneyInputSchema>;

export const SignupJourneySchema = SignupJourneyInputSchema.extend({ capturedAt: z.iso.datetime() });
export type SignupJourney = z.infer<typeof SignupJourneySchema>;

const LastPageCarrierSchema = z.object({ lastPage: SignupLastPageSchema.nullable().default(null) });
const CampaignCarrierSchema = z.object({ campaign: SignupCampaignSchema.nullable().default(null) });

export const SignupRequestSchema = SignupJourneyInputSchema.extend(LastPageCarrierSchema.shape).extend(
  CampaignCarrierSchema.shape,
);
export type SignupRequest = SignupJourneyInput & { lastPage?: string | null; campaign?: SignupCampaign | null };

export function signupLastPageFromRequest(input: unknown): string | null {
  const parsed = LastPageCarrierSchema.safeParse(input);
  return parsed.success ? parsed.data.lastPage : null;
}

export function signupCampaignFromSignupRequest(input: unknown): string | null {
  const parsed = CampaignCarrierSchema.safeParse(input);
  return parsed.success ? encodeSignupCampaign(parsed.data.campaign) : null;
}

export const RegistrationSignupSourceSchema = SignupJourneyInputSchema.omit({ template: true }).extend({
  marketingConsentedAt: z.date().nullable(),
  capturedAt: z.date(),
});
export type RegistrationSignupSource = z.infer<typeof RegistrationSignupSourceSchema>;

function parseTemplateChoice(value: string | string[] | undefined): TemplateSlug | null {
  const candidate = firstValue(value)?.trim().toLowerCase();
  return isTemplateSlug(candidate) ? candidate : null;
}

function landingPath(pathname: string): string {
  const parsed = LandingPathSchema.safeParse(pathname);
  return parsed.success ? parsed.data : SIGNUP_PATH;
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
  const referrer = parseHttpUrl(args.referer);
  const sameSite = isSameSite(referrer, args.baseUrl);

  return {
    job: parseOnboardingJob(args.searchParams[SIGNUP_JOB_QUERY_PARAM]),
    template: parseTemplateChoice(args.searchParams[SIGNUP_TEMPLATE_QUERY_PARAM]),
    landingPath: sameSite ? landingPath(referrer.pathname) : SIGNUP_PATH,
    referrerHost: referrer && !sameSite ? referrerHost(referrer) : null,
    utmSource: campaignValue(args.searchParams[UTM_QUERY_PARAMS.utmSource]),
    utmMedium: campaignValue(args.searchParams[UTM_QUERY_PARAMS.utmMedium]),
    utmCampaign: campaignValue(args.searchParams[UTM_QUERY_PARAMS.utmCampaign]),
  };
}

export function signupRequestFromRequest(args: {
  searchParams: SearchParams;
  referer: string | null;
  baseUrl: string;
}): SignupRequest {
  return {
    ...signupJourneyFromRequest(args),
    lastPage: signupLastPageFromReferer(args),
    campaign: signupCampaignFromRequest(args),
  };
}

export function withoutMarketingFields<T extends SignupJourneyInput>(journey: T): T {
  return { ...journey, referrerHost: null, utmSource: null, utmMedium: null, utmCampaign: null };
}

function hasMarketingFields(journey: SignupJourneyInput): boolean {
  return Boolean(journey.referrerHost || journey.utmSource || journey.utmMedium || journey.utmCampaign);
}

export function choiceOnlyJourney<T extends SignupJourneyInput>(journey: T): T {
  return { ...withoutMarketingFields(journey), job: null, landingPath: SIGNUP_PATH };
}

export function nextSignupJourney(args: {
  existing: SignupJourney | null;
  input: SignupJourneyInput;
  marketingConsent: boolean;
  now: Date;
}): SignupJourney {
  const job = args.input.job ?? args.existing?.job ?? null;
  const template = args.input.template ?? args.existing?.template ?? null;
  const firstTouch = args.existing ?? { ...args.input, capturedAt: args.now.toISOString() };
  const journey = { ...firstTouch, job, template };
  return args.marketingConsent ? journey : choiceOnlyJourney(journey);
}

export function signupSourceForRegistration(
  journey: SignupJourney,
  marketingConsentedAt: Date | null,
): RegistrationSignupSource | null {
  if (!marketingConsentedAt) return null;

  return {
    job: journey.job,
    landingPath: journey.landingPath,
    referrerHost: journey.referrerHost,
    utmSource: journey.utmSource,
    utmMedium: journey.utmMedium,
    utmCampaign: journey.utmCampaign,
    marketingConsentedAt: hasMarketingFields(journey) ? marketingConsentedAt : null,
    capturedAt: new Date(journey.capturedAt),
  };
}

export function signupTemplateForRegistration(journey: SignupJourney): TemplateSlug | null {
  return journey.template;
}

export function encodeSignupJourneyCookie(journey: SignupJourney): string | null {
  const encoded = Buffer.from(JSON.stringify(SignupJourneySchema.parse(journey))).toString("base64url");
  return Buffer.byteLength(encoded, "utf8") > SIGNUP_JOURNEY_COOKIE_MAX_BYTES ? null : encoded;
}

export function decodeSignupJourneyCookie(value: string | undefined): SignupJourney | null {
  if (!value || Buffer.byteLength(value, "utf8") > SIGNUP_JOURNEY_COOKIE_MAX_BYTES) return null;
  return decodeJson(SignupJourneySchema, Buffer.from(value, "base64url").toString("utf8"));
}
