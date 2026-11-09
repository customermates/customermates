import "server-only";

import type { RegistrationSignupSource } from "../signup-source";

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
} from "../signup-source";
import { readAdvertisingConsentedAt } from "./ad-attribution-cookie";

export async function rememberSignupJourney(input: unknown): Promise<void> {
  if (env.APP_MODE !== "cloud") return;
  const parsed = SignupJourneyInputSchema.safeParse(input);
  if (!parsed.success) return;

  const cookieStore = await cookies();
  if (SIGNUP_SOURCE_NOTICE_VERSION === null || (await readAdvertisingConsentedAt()) === null) {
    if (cookieStore.has(SIGNUP_JOURNEY_COOKIE_NAME)) cookieStore.delete(SIGNUP_JOURNEY_COOKIE_NAME);
    return;
  }
  const journey = nextSignupJourney({
    existing: decodeSignupJourneyCookie(cookieStore.get(SIGNUP_JOURNEY_COOKIE_NAME)?.value),
    input: parsed.data,
    marketingConsent: true,
    now: new Date(),
  });
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
  const cookieStore = await cookies();
  if (SIGNUP_SOURCE_NOTICE_VERSION === null) return null;
  const journey = decodeSignupJourneyCookie(cookieStore.get(SIGNUP_JOURNEY_COOKIE_NAME)?.value);
  if (!journey) return null;
  return signupSourceForRegistration(journey, await readAdvertisingConsentedAt());
}

export async function forgetSignupJourney(): Promise<void> {
  const cookieStore = await cookies();
  if (cookieStore.has(SIGNUP_JOURNEY_COOKIE_NAME)) cookieStore.delete(SIGNUP_JOURNEY_COOKIE_NAME);
}
