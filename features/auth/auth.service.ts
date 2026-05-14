import type { EmailService } from "@/features/email/email.service";
import type { Redirect } from "./auth-outcome";

import React from "react";
import { APIError } from "better-auth";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import ResetPassword from "@/components/emails/reset-password";
import VerifyEmail from "@/components/emails/verify-email";
import NewUserNotification from "@/components/emails/new-user-notification";
import { auth } from "@/core/auth/better-auth";
import { mustVerifyEmail } from "./email-verification-grace";
import { redirectTo } from "./auth-outcome";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { env } from "@/env";

type AuthUser = { id: string; email: string; name: string; emailVerified: boolean };
export type AuthResult = { ok: true; user: AuthUser } | { ok: false; error: CustomErrorCode };

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
export type SessionOrRedirect = { session: Session } | Redirect;

export class AuthService {
  constructor(private emailService: EmailService) {}

  async getSession() {
    const headersList = await headers();

    if (!this.hasAuthToken(headersList)) return null;

    return await auth.api.getSession({ headers: headersList });
  }

  async resolveSession(): Promise<SessionOrRedirect> {
    const headersList = await headers();

    if (!this.hasAuthToken(headersList)) return redirectTo("/auth/signin");

    const session = await auth.api.getSession({ headers: headersList });
    if (!session) return redirectTo("/auth/signin");
    if (mustVerifyEmail(session.user)) return redirectTo("/auth/verify-email");

    return { session };
  }

  async signInWithEmail(args: {
    email: string;
    password: string;
    rememberMe: boolean;
    callbackURL?: string;
  }): Promise<AuthResult> {
    try {
      const res = await auth.api.signInEmail({
        headers: await headers(),
        body: { ...args, callbackURL: args.callbackURL ?? env.BASE_URL },
      });

      return { ok: true, user: res.user } as const;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async registerWithEmail(args: {
    email: string;
    name: string;
    password: string;
    callbackURL?: string;
  }): Promise<AuthResult> {
    try {
      const res = await auth.api.signUpEmail({
        headers: await headers(),
        body: args,
      });

      return { ok: true, user: res.user } as const;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    await auth.api.requestPasswordReset({
      headers: await headers(),
      body: { email, redirectTo: "/auth/reset-password" },
    });
  }

  async resetPassword(args: { newPassword: string; token: string }): Promise<void> {
    await auth.api.resetPassword({ headers: await headers(), body: args });
  }

  async resendVerificationEmail(email: string, options?: { keepSession?: boolean }): Promise<void> {
    await auth.api.sendVerificationEmail({
      headers: await headers(),
      body: { email, callbackURL: "/" },
    });

    if (!options?.keepSession) await auth.api.signOut({ headers: await headers() });
  }

  async sendVerificationEmail(args: { to: string; url: string }): Promise<void> {
    const t = await getTranslations("VerifyEmail");

    await this.emailService.send({
      to: args.to,
      subject: t("subject"),
      react: React.createElement(VerifyEmail, {
        url: args.url,
        subject: t("subject"),
        intro: t("intro"),
        cta: t("cta"),
        fallback: t("fallback"),
        securityNotice: t("securityNotice"),
      }),
    });
  }

  async sendResetPasswordEmail(args: { to: string; url: string }): Promise<void> {
    const t = await getTranslations("ResetPassword");

    await this.emailService.send({
      to: args.to,
      subject: t("subject"),
      react: React.createElement(ResetPassword, {
        url: args.url,
        subject: t("subject"),
        intro: t("intro"),
        cta: t("cta"),
        fallback: t("fallback"),
        securityNotice: t("securityNotice"),
      }),
    });
  }

  async continueWithSocials(args: { provider: "google" | "microsoft"; callbackURL?: string }) {
    const res = await auth.api.signInSocial({
      headers: await headers(),
      body: { ...args, callbackURL: args.callbackURL ?? env.BASE_URL },
    });

    return res;
  }

  async signOut(): Promise<void> {
    await auth.api.signOut({ headers: await headers() });
  }

  async sendNewUserNotificationEmail(args: { email: string; name: string; provider?: string }): Promise<void> {
    await this.emailService.send({
      to: env.RESEND_OPERATOR_EMAIL,
      subject: "New User Registration",
      react: React.createElement(NewUserNotification, {
        email: args.email,
        name: args.name,
        provider: args.provider,
      }),
    });
  }

  async createApiKey(args: { name: string; expiresIn?: number }) {
    return await auth.api.createApiKey({
      body: args,
      headers: await headers(),
    });
  }

  async deleteApiKey(keyId: string): Promise<void> {
    await auth.api.deleteApiKey({
      body: { keyId },
      headers: await headers(),
    });
  }

  async listApiKeys() {
    return await auth.api.listApiKeys({
      headers: await headers(),
    });
  }

  private handleError(source: unknown): AuthResult {
    const ERROR_MAP: Record<string, CustomErrorCode> = {
      EMAIL_NOT_VERIFIED: CustomErrorCode.emailNotVerified,
      INVALID_EMAIL_OR_PASSWORD: CustomErrorCode.invalidCredentials,
      USER_NOT_FOUND: CustomErrorCode.invalidCredentials,
      USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: CustomErrorCode.emailAlreadyExists,
      GENERIC: CustomErrorCode.generic,
    };

    const error =
      source instanceof APIError && source.body?.code
        ? (ERROR_MAP[source.body?.code] ?? CustomErrorCode.generic)
        : CustomErrorCode.generic;

    return { ok: false, error } as const;
  }

  private hasAuthToken(headersList: Headers): boolean {
    const cookieHeader = headersList.get("cookie") ?? "";
    const hasSessionCookie = cookieHeader.includes("app.session_token=");
    const hasApiKey = headersList.has("x-api-key");

    return hasSessionCookie || hasApiKey;
  }
}
