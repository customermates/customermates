"use server";

import type { EmailSignInData } from "@/features/auth/sign-in-with-email.interactor";
import type { EmailSignUpData } from "@/features/auth/sign-up-with-email.interactor";
import type { RequestPasswordResetData } from "@/features/auth/request-password-reset.interactor";
import type { ResetPasswordData } from "@/features/auth/reset-password.interactor";
import type { DecideMcpConsentData } from "@/features/auth/decide-mcp-consent.interactor";

import {
  getSignInWithEmailInteractor,
  getSignUpWithEmailInteractor,
  getRequestPasswordResetInteractor,
  getContinueWithSocialsInteractor,
  getResetPasswordInteractor,
  getResendVerificationEmailInteractor,
  getDecideMcpConsentInteractor,
} from "@/core/di";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { serializeResult } from "@/core/utils/action-result";
import { isRedirect } from "@/features/auth/auth-outcome";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";
import { resolveOnboardingIntent } from "@/features/company/next/onboarding-intent";
import { buildLocalePath } from "@/i18n/locale-registry";

export async function signInWithEmailAction(data: EmailSignInData) {
  const result = await getSignInWithEmailInteractor().invoke(data);
  if (isRedirect(result)) return { ok: true as const, data: { url: result.redirect } };

  const serialized = await serializeResult(result);
  if (serialized.ok) {
    return {
      ok: true as const,
      data: { url: serialized.data.callbackURL ?? "/" },
    };
  }

  return serialized;
}

export async function continueWithGoogleAction(callbackURL?: string, errorCallbackURL?: string) {
  const result = await getContinueWithSocialsInteractor().invoke({
    provider: "google",
    callbackURL,
    errorCallbackURL,
  });
  if (isRedirect(result)) return { ok: true as const, data: { url: result.redirect } };

  const serialized = await serializeResult(result);
  if (!serialized.ok) return serialized;

  return { ok: true as const, data: { url: null } };
}

export async function continueWithMicrosoftAction(callbackURL?: string, errorCallbackURL?: string) {
  const result = await getContinueWithSocialsInteractor().invoke({
    provider: "microsoft",
    callbackURL,
    errorCallbackURL,
  });
  if (isRedirect(result)) return { ok: true as const, data: { url: result.redirect } };

  const serialized = await serializeResult(result);
  if (!serialized.ok) return serialized;

  return { ok: true as const, data: { url: null } };
}

export async function signUpWithEmailAction(data: EmailSignUpData, invitationIntent?: string) {
  if (!invitationIntent) return serializeResult(getSignUpWithEmailInteractor().invoke(data));

  const invitation = await resolveOnboardingIntent(invitationIntent);
  if (invitation.status !== "valid" || invitation.type !== "invitation") {
    const errorMessage = invitation.status === "invalid" ? invitation.errorMessage : "invalidOnboardingIntent";
    return redirect(buildLocalePath(await getLocale(), `/auth/error?type=${errorMessage}`));
  }

  const callbackURL = pathWithOnboardingIntent("/auth/invitation", invitation.intent);
  const result = await getSignUpWithEmailInteractor().invoke({ ...data, callbackURL });
  if (isRedirect(result)) return redirect(buildLocalePath(await getLocale(), result.redirect));

  return serializeResult(result);
}

export async function requestPasswordResetAction(data: RequestPasswordResetData, onboardingIntentValue?: string) {
  if (!onboardingIntentValue) return serializeResult(getRequestPasswordResetInteractor().invoke(data));

  const onboardingIntent = await resolveOnboardingIntent(onboardingIntentValue);
  if (onboardingIntent.status !== "valid") return serializeResult(getRequestPasswordResetInteractor().invoke(data));

  return serializeResult(
    getRequestPasswordResetInteractor().invoke(
      data,
      pathWithOnboardingIntent("/auth/reset-password", onboardingIntent.intent),
    ),
  );
}

export async function resetPasswordAction(data: ResetPasswordData, onboardingIntentValue?: string) {
  if (!onboardingIntentValue) return serializeResult(getResetPasswordInteractor().invoke(data));

  const onboardingIntent = await resolveOnboardingIntent(onboardingIntentValue);
  if (onboardingIntent.status !== "valid") return serializeResult(getResetPasswordInteractor().invoke(data));

  return serializeResult(
    getResetPasswordInteractor().invoke(data, {
      error: pathWithOnboardingIntent("/auth/forgot-password?info=RESET_LINK_INVALID", onboardingIntent.intent),
      success: pathWithOnboardingIntent("/auth/signin", onboardingIntent.intent),
    }),
  );
}

export async function resendVerificationEmailFromAuthAction(onboardingIntentValue?: string): Promise<{
  ok: boolean;
}> {
  if (!onboardingIntentValue) return await getResendVerificationEmailInteractor().invoke();

  const onboardingIntent = await resolveOnboardingIntent(onboardingIntentValue);
  if (onboardingIntent.status !== "valid") return await getResendVerificationEmailInteractor().invoke();

  const destination = onboardingIntent.type === "invitation" ? "/auth/invitation" : "/onboarding/wizard";
  return await getResendVerificationEmailInteractor().invoke(
    pathWithOnboardingIntent(destination, onboardingIntent.intent),
  );
}

export async function decideMcpConsentAction(data: DecideMcpConsentData) {
  return serializeResult(getDecideMcpConsentInteractor().invoke(data));
}
