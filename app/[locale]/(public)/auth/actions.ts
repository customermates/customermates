"use server";

import type { EmailSignInData } from "@/features/auth/sign-in-with-email.interactor";
import type { EmailSignUpData } from "@/features/auth/sign-up-with-email.interactor";
import type { RequestPasswordResetData } from "@/features/auth/request-password-reset.interactor";
import type { ResetPasswordData } from "@/features/auth/reset-password.interactor";
import type { $ZodErrorTree } from "zod/v4/core";

import {
  getSignInWithEmailInteractor,
  getSignUpWithEmailInteractor,
  getRequestPasswordResetInteractor,
  getContinueWithSocialsInteractor,
  getResetPasswordInteractor,
  getResendVerificationEmailInteractor,
  getAuthService,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { isRedirect } from "@/features/auth/auth-outcome";

type EmailSignInActionResult = { ok: true; data: { url: string } } | { ok: false; error: $ZodErrorTree<unknown> };

export async function signInWithEmailAction(data: EmailSignInData): Promise<EmailSignInActionResult> {
  const result = await getSignInWithEmailInteractor().invoke(data);
  if (isRedirect(result)) return { ok: true as const, data: { url: result.redirect } };
  if (result.ok) return { ok: true as const, data: { url: result.data.callbackURL ?? "/" } };

  return serializeResult(result);
}

export async function continueWithGoogleAction(callbackURL?: string, errorCallbackURL?: string) {
  const result = await getContinueWithSocialsInteractor().invoke({ provider: "google", callbackURL, errorCallbackURL });
  return { ok: true as const, data: { url: isRedirect(result) ? result.redirect : null } };
}

export async function continueWithMicrosoftAction(callbackURL?: string, errorCallbackURL?: string) {
  const result = await getContinueWithSocialsInteractor().invoke({
    provider: "microsoft",
    callbackURL,
    errorCallbackURL,
  });
  return { ok: true as const, data: { url: isRedirect(result) ? result.redirect : null } };
}

export async function signUpWithEmailAction(data: EmailSignUpData) {
  return serializeResult(getSignUpWithEmailInteractor().invoke(data));
}

export async function requestPasswordResetAction(data: RequestPasswordResetData) {
  return serializeResult(getRequestPasswordResetInteractor().invoke(data));
}

export async function resetPasswordAction(data: ResetPasswordData) {
  return serializeResult(getResetPasswordInteractor().invoke(data));
}

export async function resendVerificationEmailFromAuthAction(): Promise<{ ok: boolean }> {
  return await getResendVerificationEmailInteractor().invoke();
}

export async function decideMcpConsentAction(data: {
  consentCode: string;
  accept: boolean;
}): Promise<{ redirectURI: string } | null> {
  return getAuthService().decideMcpConsent(data);
}
