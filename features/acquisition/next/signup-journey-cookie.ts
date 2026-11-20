import "server-only";

import type { TemplateSlug } from "@/core/templates/template-slugs";
import type { RegistrationSignupSource, SignupJourney } from "../signup-source";

import { cookies } from "next/headers";

import { env } from "@/env";
import { SIGNUP_SOURCE_NOTICE_VERSION } from "@/constants/legal-documents";
import {
  SIGNUP_JOURNEY_COOKIE_MAX_AGE_SECONDS,
  SIGNUP_JOURNEY_COOKIE_NAME,
  SignupJourneyInputSchema,
  decodeSignupJourneyCookie,
  encodeSignupJourneyCookie,
  nextSignupJourney,
  signupSourceForRegistration,
  signupTemplateForRegistration,
} from "../signup-source";
import { readAdvertisingConsentedAt } from "./ad-attribution-cookie";

async function hasSignupSourceConsent(): Promise<boolean> {
  return SIGNUP_SOURCE_NOTICE_VERSION !== null && (await readAdvertisingConsentedAt()) !== null;
}

async function readJourney(): Promise<SignupJourney | null> {
  const cookieStore = await cookies();
  return decodeSignupJourneyCookie(cookieStore.get(SIGNUP_JOURNEY_COOKIE_NAME)?.value);
}

export async function rememberSignupJourney(input: unknown): Promise<void> {
  if (env.APP_MODE !== "cloud") return;
  const parsed = SignupJourneyInputSchema.safeParse(input);
  if (!parsed.success) return;

  const cookieStore = await cookies();
  const marketingConsent = await hasSignupSourceConsent();
  const journey = nextSignupJourney({
    existing: decodeSignupJourneyCookie(cookieStore.get(SIGNUP_JOURNEY_COOKIE_NAME)?.value),
    input: parsed.data,
    marketingConsent,
    now: new Date(),
  });
  if (!marketingConsent && journey.template === null) {
    if (cookieStore.has(SIGNUP_JOURNEY_COOKIE_NAME)) cookieStore.delete(SIGNUP_JOURNEY_COOKIE_NAME);
    return;
  }
  const encoded = encodeSignupJourneyCookie(journey);
  if (!encoded) return;

  cookieStore.set(SIGNUP_JOURNEY_COOKIE_NAME, encoded, {
    httpOnly: true,
    maxAge: SIGNUP_JOURNEY_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: new URL(env.BASE_URL).protocol === "https:",
  });
}

export async function readRegistrationSignupSource(): Promise<RegistrationSignupSource | null> {
  if (env.APP_MODE !== "cloud") return null;
  const journey = await readJourney();
  if (!journey || SIGNUP_SOURCE_NOTICE_VERSION === null) return null;
  return signupSourceForRegistration(journey, await readAdvertisingConsentedAt());
}

export async function readRegistrationSignupTemplate(): Promise<TemplateSlug | null> {
  if (env.APP_MODE !== "cloud") return null;
  const journey = await readJourney();
  return journey ? signupTemplateForRegistration(journey) : null;
}

export async function forgetSignupJourney(): Promise<void> {
  const cookieStore = await cookies();
  if (cookieStore.has(SIGNUP_JOURNEY_COOKIE_NAME)) cookieStore.delete(SIGNUP_JOURNEY_COOKIE_NAME);
}
