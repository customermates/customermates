import "server-only";

import type { PublicAdAttributionCookie, RegistrationAdAttribution } from "../ad-attribution.schema";

import { cookies } from "next/headers";

import { env } from "@/env";
import {
  adAttributionSigningSecret,
  decodePublicAdAttributionCookie,
  encodePublicAdAttributionCookie,
} from "../ad-attribution-cookie-codec";
import { AdAttributionCookieRepo } from "../ad-attribution.repo";
import {
  PUBLIC_AD_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
  PUBLIC_AD_ATTRIBUTION_COOKIE_NAME,
} from "../ad-attribution.schema";
import { registrationAdAttributionFromCookie } from "../ad-click-retention";

function signingSecret(): string | null {
  return env.APP_MODE === "cloud" ? adAttributionSigningSecret(env.BETTER_AUTH_SECRET) : null;
}

export class NextAdAttributionCookieRepo extends AdAttributionCookieRepo {
  async readCookie(): Promise<PublicAdAttributionCookie | null> {
    const secret = signingSecret();
    if (!secret) return null;
    const cookieStore = await cookies();
    return decodePublicAdAttributionCookie(cookieStore.get(PUBLIC_AD_ATTRIBUTION_COOKIE_NAME)?.value, secret);
  }

  async writeCookie(value: PublicAdAttributionCookie): Promise<boolean> {
    const secret = signingSecret();
    if (!secret) return false;

    const remainingSeconds = Math.max(
      0,
      Math.min(
        PUBLIC_AD_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
        Math.floor((new Date(value.expiresAt).getTime() - Date.now()) / 1_000),
      ),
    );
    if (remainingSeconds === 0) return false;

    const encoded = encodePublicAdAttributionCookie(value, secret);
    if (!encoded) return false;

    const cookieStore = await cookies();
    cookieStore.set(PUBLIC_AD_ATTRIBUTION_COOKIE_NAME, encoded, {
      httpOnly: true,
      maxAge: remainingSeconds,
      path: "/",
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    });
    return true;
  }
}

const registrationCookieRepo = new NextAdAttributionCookieRepo();

export async function readRegistrationAdAttribution(): Promise<RegistrationAdAttribution[]> {
  const cookie = await registrationCookieRepo.readCookie();
  if (!cookie) return [];
  const now = new Date();
  return registrationAdAttributionFromCookie(cookie, now).filter(
    (attribution) => attribution.expiresAt.getTime() > now.getTime(),
  );
}

export async function clearRegisteredAdClicksFromCookie(): Promise<void> {
  const cookie = await registrationCookieRepo.readCookie();
  if (!cookie || cookie.clicks.length === 0) return;
  await registrationCookieRepo.writeCookie({ ...cookie, clicks: [] });
}
