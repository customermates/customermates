"use server";

import type { EmailSignInData } from "@/features/auth/sign-in-with-email.interactor";
import type { EmailSignUpData } from "@/features/auth/sign-up-with-email.interactor";
import type { RequestPasswordResetData } from "@/features/auth/request-password-reset.interactor";
import type { ResetPasswordData } from "@/features/auth/reset-password.interactor";

import { redirect } from "next/navigation";

import {
  getSignInWithEmailInteractor,
  getSignUpWithEmailInteractor,
  getRequestPasswordResetInteractor,
  getContinueWithSocialsInteractor,
  getResetPasswordInteractor,
  getAuthService,
} from "@/core/app-di";
import { serializeResult } from "@/core/utils/action-result";
import { isRedirect } from "@/features/auth/auth-outcome";

export async function signInWithEmailAction(data: EmailSignInData) {
  return serializeResult(getSignInWithEmailInteractor().invoke(data));
}

export async function continueWithGoogleAction(callbackURL?: string) {
  const result = await getContinueWithSocialsInteractor().invoke({ provider: "google", callbackURL });
  if (result && isRedirect(result)) redirect(result.redirect);
}

export async function continueWithMicrosoftAction(callbackURL?: string) {
  const result = await getContinueWithSocialsInteractor().invoke({ provider: "microsoft", callbackURL });
  if (result && isRedirect(result)) redirect(result.redirect);
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

export async function resendVerificationEmailAction(email: string) {
  const session = await getAuthService().getSession();

  if (!session) redirect("/auth/signin");

  await getAuthService().resendVerificationEmail(email);
}
