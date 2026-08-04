import type { EmailService } from "@/features/email/email.service";
import type { Redirect } from "./auth-outcome";

import React from "react";
import { APIError } from "better-auth";
import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import ResetPassword from "@/components/emails/reset-password";
import VerifyEmail from "@/components/emails/verify-email";
import NewUserNotification from "@/components/emails/new-user-notification";
import { auth } from "@/core/auth/better-auth";
import { prisma } from "@/prisma/db";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { mustVerifyEmail } from "./email-verification-grace";
import { redirectTo } from "./auth-outcome";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { env } from "@/env";

type AuthUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};
type AuthResult = { ok: true; user: AuthUser } | { ok: false; error: CustomErrorCode };

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
type SessionOrRedirect = { session: Session } | Redirect;

type McpConsentValue = {
  clientId: string;
  redirectURI: string;
  scope: string[] | string;
  userId: string;
  requireConsent?: boolean;
  state?: string | null;
};

export class AuthService {
  constructor(private emailService: EmailService) {}

  async getSession() {
    const headersList = await headers();

    if (!this.hasAuthToken(headersList)) return null;

    if (this.hasBearerToken(headersList)) {
      try {
        return await this.resolveMcpBearerSession(headersList);
      } catch {
        return null;
      }
    }

    try {
      return await auth.api.getSession({ headers: headersList });
    } catch {
      return null;
    }
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
  }): Promise<AuthResult | Redirect> {
    try {
      const res = await auth.api.signInEmail({
        headers: await headers(),
        body: {
          email: args.email,
          password: args.password,
          rememberMe: args.rememberMe,
          ...(args.callbackURL ? { callbackURL: args.callbackURL } : {}),
        },
      });

      return { ok: true, user: res.user } as const;
    } catch (error) {
      const redirect = this.redirectFromError(error);
      if (redirect) return redirect;

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
    const t = await getTranslations();
    const locale = await getLocale();

    await this.emailService.send({
      to: args.to,
      subject: t("VerifyEmail.subject"),
      react: React.createElement(VerifyEmail, {
        locale,
        url: args.url,
        subject: t("VerifyEmail.subject"),
        intro: t("VerifyEmail.intro"),
        cta: t("VerifyEmail.cta"),
        fallback: t("VerifyEmail.fallback"),
        securityNotice: t("VerifyEmail.securityNotice"),
      }),
    });
  }

  async sendResetPasswordEmail(args: { to: string; url: string }): Promise<void> {
    const t = await getTranslations();
    const locale = await getLocale();

    await this.emailService.send({
      to: args.to,
      subject: t("ResetPassword.subject"),
      react: React.createElement(ResetPassword, {
        locale,
        url: args.url,
        subject: t("ResetPassword.subject"),
        intro: t("ResetPassword.intro"),
        cta: t("ResetPassword.cta"),
        fallback: t("ResetPassword.fallback"),
        securityNotice: t("ResetPassword.securityNotice"),
      }),
    });
  }

  async continueWithSocials(args: {
    provider: "google" | "microsoft";
    callbackURL?: string;
    errorCallbackURL?: string;
  }) {
    const requestHeaders = await headers();
    const requestOrigin = requestHeaders.get("origin") ?? env.BASE_URL;
    const request = new Request(new URL("/api/auth/sign-in/social", requestOrigin), {
      method: "POST",
      headers: requestHeaders,
    });

    const res = await auth.api.signInSocial({
      request,
      headers: requestHeaders,
      asResponse: false,
      body: {
        provider: args.provider,
        callbackURL: args.callbackURL ?? "/",
        errorCallbackURL: args.errorCallbackURL ?? "/auth/signin",
      },
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
    const result = await auth.api.listApiKeys({
      headers: await headers(),
    });
    return result.apiKeys;
  }

  async getMcpConsentPrompt(args: {
    consentCode: string;
    clientId: string;
  }): Promise<{ clientName: string; scopes: string[]; redirectHost: string } | null> {
    const resolved = await this.resolvePendingConsent(args.consentCode);
    if (!resolved) return null;
    if (resolved.value.clientId !== args.clientId) return null;

    const application = await prisma.oauthApplication.findUnique({ where: { clientId: resolved.value.clientId } });
    if (!application) return null;

    return {
      clientName: application.name,
      scopes: this.consentScopeList(resolved.value.scope),
      redirectHost: this.redirectHost(resolved.value.redirectURI),
    };
  }

  async decideMcpConsent(args: { consentCode: string; accept: boolean }): Promise<{ redirectURI: string } | null> {
    const resolved = await this.resolvePendingConsent(args.consentCode);
    if (!resolved) return null;

    const { verification, value } = resolved;
    const redirectUrl = new URL(value.redirectURI);

    if (!args.accept) {
      await prisma.authVerification.delete({ where: { id: verification.id } });
      redirectUrl.searchParams.set("error", "access_denied");
      if (value.state) redirectUrl.searchParams.set("state", value.state);

      return { redirectURI: redirectUrl.toString() };
    }

    const code = nanoid(32);
    const scopes = this.consentScopeList(value.scope).join(" ");

    await prisma.authVerification.update({
      where: { id: verification.id },
      data: { identifier: code, value: JSON.stringify({ ...value, requireConsent: false }) },
    });

    await prisma.oauthConsent.upsert({
      where: { userId_clientId: { userId: value.userId, clientId: value.clientId } },
      create: { id: crypto.randomUUID(), userId: value.userId, clientId: value.clientId, scopes, consentGiven: true },
      update: { scopes, consentGiven: true },
    });

    redirectUrl.searchParams.set("code", code);
    if (value.state) redirectUrl.searchParams.set("state", value.state);

    return { redirectURI: redirectUrl.toString() };
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

    return hasSessionCookie || hasApiKey || this.hasBearerToken(headersList);
  }

  private hasBearerToken(headersList: Headers): boolean {
    return (headersList.get("authorization") ?? "").toLowerCase().startsWith("bearer ");
  }

  async isMcpBearerValid(headersList: Headers): Promise<boolean> {
    try {
      return (await this.resolveMcpBearerSession(headersList)) !== null;
    } catch {
      return false;
    }
  }

  private async resolveMcpBearerSession(headersList: Headers): Promise<Session | null> {
    const token = await auth.api.getMcpSession({ headers: headersList });

    if (!token) return null;
    if (new Date(token.accessTokenExpiresAt).getTime() <= Date.now()) return null;

    const userId = token.userId;
    if (!userId) return null;

    const authUser = await runWithoutTenant(() => prisma.authUser.findUnique({ where: { id: userId } }));
    if (!authUser) return null;

    return {
      session: {
        id: token.accessToken,
        token: token.accessToken,
        userId: authUser.id,
        expiresAt: new Date(token.accessTokenExpiresAt),
        createdAt: authUser.createdAt,
        updatedAt: authUser.updatedAt,
        ipAddress: null,
        userAgent: null,
      },
      user: {
        id: authUser.id,
        email: authUser.email,
        name: authUser.name,
        emailVerified: authUser.emailVerified,
        image: authUser.image,
        companyId: authUser.companyId,
        createdAt: authUser.createdAt,
        updatedAt: authUser.updatedAt,
      },
    } as Session;
  }

  private async resolvePendingConsent(
    consentCode: string,
  ): Promise<{ verification: { id: string }; value: McpConsentValue } | null> {
    const session = await this.getSession();
    if (!session) return null;

    const verification = await prisma.authVerification.findFirst({ where: { identifier: consentCode } });
    if (!verification) return null;

    const value = this.parseConsentValue(verification.value);
    if (!value) return null;
    if (value.userId !== session.user.id) return null;
    if (!value.requireConsent) return null;

    if (verification.expiresAt.getTime() <= Date.now()) {
      await prisma.authVerification.delete({ where: { id: verification.id } });
      return null;
    }

    return { verification, value };
  }

  private parseConsentValue(raw: string): McpConsentValue | null {
    try {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed?.userId !== "string" ||
        typeof parsed?.clientId !== "string" ||
        typeof parsed?.redirectURI !== "string"
      )
        return null;

      return parsed as McpConsentValue;
    } catch {
      return null;
    }
  }

  private consentScopeList(scope: string[] | string): string[] {
    if (Array.isArray(scope)) return scope.filter(Boolean);

    return String(scope ?? "")
      .split(" ")
      .filter(Boolean);
  }

  private redirectHost(redirectURI: string): string {
    try {
      return new URL(redirectURI).host;
    } catch {
      return redirectURI;
    }
  }

  private redirectFromError(error: unknown): Redirect | null {
    if (!(error instanceof APIError)) return null;

    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode !== 302) return null;

    const headersValue = (error as { headers?: Headers | Record<string, string> }).headers;
    const location = headersValue ? new Headers(headersValue).get("location") : null;
    if (!location) return null;

    return redirectTo(location);
  }
}
