"use server";

import type { EmailSignInData } from "@/features/auth/sign-in-with-email.interactor";
import type { EmailSignUpData } from "@/features/auth/sign-up-with-email.interactor";
import type { RequestPasswordResetData } from "@/features/auth/request-password-reset.interactor";
import type { ResetPasswordData } from "@/features/auth/reset-password.interactor";

import { redirect } from "next/navigation";

import { di } from "@/core/dependency-injection/container";
import { SignInWithEmailInteractor } from "@/features/auth/sign-in-with-email.interactor";
import { SignUpWithEmailInteractor } from "@/features/auth/sign-up-with-email.interactor";
import { RequestPasswordResetInteractor } from "@/features/auth/request-password-reset.interactor";
import { ContinueWithSocialsInteractor } from "@/features/auth/continue-with-socials.interactor";
import { ResetPasswordInteractor } from "@/features/auth/reset-password.interactor";
import { AuthService } from "@/features/auth/auth.service";
import { serializeResult } from "@/core/utils/action-result";

export async function signInWithEmailAction(data: EmailSignInData) {
  return serializeResult(di.get(SignInWithEmailInteractor).invoke(data));
}

export async function continueWithGoogleAction(callbackURL?: string) {
  return di.get(ContinueWithSocialsInteractor).invoke({ provider: "google", callbackURL });
}

export async function continueWithMicrosoftAction(callbackURL?: string) {
  return di.get(ContinueWithSocialsInteractor).invoke({ provider: "microsoft", callbackURL });
}

export async function signUpWithEmailAction(data: EmailSignUpData) {
  return serializeResult(di.get(SignUpWithEmailInteractor).invoke(data));
}

export async function requestPasswordResetAction(data: RequestPasswordResetData) {
  return serializeResult(di.get(RequestPasswordResetInteractor).invoke(data));
}

export async function resetPasswordAction(data: ResetPasswordData) {
  return serializeResult(di.get(ResetPasswordInteractor).invoke(data));
}

export async function resendVerificationEmailAction(email: string) {
  const session = await di.get(AuthService).getSession();

  if (!session) redirect("/auth/signin");

  await di.get(AuthService).resendVerificationEmail(email);
}
