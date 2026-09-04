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
  const result = await getSignUpWithEmailInteractor().invoke(data, invitationIntent);
  if (isRedirect(result)) redirect(buildLocalePath(await getLocale(), result.redirect));

  return serializeResult(result);
}

export async function requestPasswordResetAction(data: RequestPasswordResetData, onboardingIntentValue?: string) {
  return serializeResult(getRequestPasswordResetInteractor().invoke(data, onboardingIntentValue));
}

export async function resetPasswordAction(data: ResetPasswordData, onboardingIntentValue?: string) {
  return serializeResult(getResetPasswordInteractor().invoke(data, onboardingIntentValue));
}

export async function resendVerificationEmailFromAuthAction(onboardingIntentValue?: string): Promise<{
  ok: boolean;
}> {
  return await getResendVerificationEmailInteractor().invoke(onboardingIntentValue);
}

export async function decideMcpConsentAction(data: DecideMcpConsentData) {
  return serializeResult(getDecideMcpConsentInteractor().invoke(data));
}
