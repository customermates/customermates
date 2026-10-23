import type { EmailService } from "@/features/email/email.service";
import type { Redirect } from "./auth-outcome";

import React from "react";
import { APIError } from "better-auth";
import { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import { nanoid } from "nanoid";
import { cookies, headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import AccountAccessRevoked from "@/components/emails/account-access-revoked";
import ResetPassword from "@/components/emails/reset-password";
import VerifyEmail from "@/components/emails/verify-email";
import NewUserNotification from "@/components/emails/new-user-notification";
import { DEFAULT_EMAIL_LAYOUT_COPY, getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import {
  auth,
  bindApiKeyToCompany,
  deleteApiKeysForIdentities,
  revokeMembershipCredentials,
} from "@/core/auth/better-auth";
import { getTransactionClient } from "@/core/decorators/transaction-context";
import { prisma } from "@/prisma/db";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { redirectTo } from "./auth-outcome";
import {
  approveMcpAuthorizationCodeValue,
  mcpAuthorizationCodeWorkspaceIdentifier,
  mcpResourceWorkspaceOf,
  withMcpResourceWorkspace,
} from "./mcp-authorization-code";
import { requestedWorkspaceSlug } from "@/core/navigation/workspace-request-header";
import { SESSION_HINT_COOKIE_NAME } from "./session-hint";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { env } from "@/env";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";
import { getRequestAppLocale } from "@/i18n/request-app-locale";

type AuthUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};
type AuthResult = { ok: true; user: AuthUser } | { ok: false; error: CustomErrorCode };

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
export type InteractiveSession = Session;
export type AuthenticatedSession = Pick<Session, "session" | "user">;
export type CredentialWorkspace =
  | { kind: "integration"; companyId: string | null }
  | { kind: "session"; sessionId: string; workspaceSlug: string | null };
export type McpCredentialWorkspace = { credential: "apiKey" | "bearer"; companyId: string | null };
type CreateApiKeyError =
  | CustomErrorCode.apiKeyMinExpiration
  | CustomErrorCode.apiKeyMaxExpiration
  | CustomErrorCode.apiKeyNameLength;
type CreatedApiKey = Awaited<ReturnType<typeof auth.api.createApiKey>>;
type CreateApiKeyResult = { ok: true; data: CreatedApiKey } | { ok: false; error: CreateApiKeyError };

type McpConsentValue = {
  clientId: string;
  redirectURI: string;
  scope: string[] | string;
  userId: string;
  requireConsent?: boolean;
  state?: string | null;
};

const MCP_CODE_WORKSPACE_TTL_MS = 10 * 60 * 1000;

export class AuthService {
  constructor(private emailService: EmailService) {}

  async deleteVerificationsForEmails(emails: string[]): Promise<void> {
    await (getTransactionClient<typeof prisma>() ?? prisma).authVerification.deleteMany({
      where: { identifier: { in: emails, mode: "insensitive" } },
    });
  }

  deleteApiKeysForIdentities(identityIds: string[]): Promise<void> {
    return deleteApiKeysForIdentities(identityIds);
  }

  async revokeOauthConsents(userId: string): Promise<number> {
    const consents = await prisma.oauthConsent.deleteMany({ where: { userId } });
    return consents.count;
  }

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

  async getInteractiveSession(): Promise<InteractiveSession | null> {
    const headersList = await headers();
    if (headersList.has("x-api-key") || this.hasBearerToken(headersList)) return null;
    const hasSessionCookie =
      this.hasCookie(headersList, "app.session_token") || this.hasCookie(headersList, "__Secure-app.session_token");
    if (!hasSessionCookie) return null;

    try {
      return await auth.api.getSession({ headers: headersList });
    } catch {
      return null;
    }
  }

  async getCredentialWorkspace(session: AuthenticatedSession, headersList?: Headers): Promise<CredentialWorkspace> {
    const requestHeaders = headersList ?? (await headers());

    if (requestHeaders.has("x-api-key")) {
      const key = await prisma.apikey.findUnique({
        where: { id: session.session.id },
        select: { referenceId: true, companyId: true },
      });
      return { kind: "integration", companyId: key?.referenceId === session.user.id ? key.companyId : null };
    }

    if (this.hasBearerToken(requestHeaders)) {
      const token = await prisma.oauthAccessToken.findUnique({
        where: { accessToken: session.session.token },
        select: { userId: true, companyId: true },
      });
      return { kind: "integration", companyId: token?.userId === session.user.id ? token.companyId : null };
    }

    return {
      kind: "session",
      sessionId: session.session.id,
      workspaceSlug: requestedWorkspaceSlug(requestHeaders),
    };
  }

  async revokeMembershipCredentials(authUserId: string, companyId: string): Promise<number> {
    return revokeMembershipCredentials(authUserId, companyId);
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

  async requestPasswordReset(email: string, redirectTo = "/auth/reset-password"): Promise<void> {
    await auth.api.requestPasswordReset({
      headers: await headers(),
      body: { email, redirectTo },
    });
  }

  async resetPassword(args: { newPassword: string; token: string }): Promise<void> {
    await auth.api.resetPassword({ headers: await headers(), body: args });
  }

  async resendVerificationEmail(
    email: string,
    options?: { callbackURL?: string; keepSession?: boolean },
  ): Promise<void> {
    await auth.api.sendVerificationEmail({
      headers: await headers(),
      body: { email, callbackURL: options?.callbackURL ?? "/" },
    });

    if (!options?.keepSession) await auth.api.signOut({ headers: await headers() });
  }

  async isEmailPendingVerification(email: string): Promise<boolean> {
    const authUser = await runWithoutTenant(() =>
      prisma.authUser.findFirst({ where: { email: email.toLowerCase() }, select: { emailVerified: true } }),
    );

    return authUser !== null && !authUser.emailVerified;
  }

  async sendVerificationEmail(args: { to: string; url: string }): Promise<void> {
    const t = await getTranslations();
    const locale = await getRequestAppLocale();
    const layoutCopy = await getEmailLayoutCopy(locale);

    const sent = await this.emailService.send({
      to: args.to,
      subject: t("VerifyEmail.subject"),
      react: React.createElement(VerifyEmail, {
        locale,
        layoutCopy,
        url: args.url,
        subject: t("VerifyEmail.subject"),
        intro: t("VerifyEmail.intro"),
        cta: t("VerifyEmail.cta"),
        fallback: t("VerifyEmail.fallback"),
        securityNotice: t("VerifyEmail.securityNotice"),
      }),
    });

    if (!sent) throw new Error("The verification email was rejected by the mail provider");
  }

  async sendAccountAccessRevokedEmail(args: { to: string }): Promise<void> {
    const t = await getTranslations();
    const locale = await getRequestAppLocale();
    const layoutCopy = await getEmailLayoutCopy(locale);

    await this.emailService.send({
      to: args.to,
      subject: t("AccountAccessRevoked.subject"),
      react: React.createElement(AccountAccessRevoked, {
        locale,
        layoutCopy,
        greeting: t("AccountAccessRevoked.greeting"),
        body: t("AccountAccessRevoked.body"),
        cta: t("AccountAccessRevoked.cta"),
        signoff: t("AccountAccessRevoked.signoff"),
        subject: t("AccountAccessRevoked.subject"),
        title: t("AccountAccessRevoked.title"),
      }),
    });
  }

  async sendResetPasswordEmail(args: { to: string; url: string }): Promise<void> {
    const t = await getTranslations();
    const locale = await getRequestAppLocale();
    const layoutCopy = await getEmailLayoutCopy(locale);

    await this.emailService.send({
      to: args.to,
      subject: t("ResetPassword.subject"),
      react: React.createElement(ResetPassword, {
        locale,
        layoutCopy,
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
    (await cookies()).delete(SESSION_HINT_COOKIE_NAME);
  }

  async sendNewUserNotificationEmail(args: { email: string; name: string; provider?: string }): Promise<void> {
    await this.emailService.send({
      to: env.RESEND_OPERATOR_EMAIL,
      subject: "New User Registration",
      react: React.createElement(NewUserNotification, {
        email: args.email,
        layoutCopy: DEFAULT_EMAIL_LAYOUT_COPY,
        locale: DEFAULT_LOCALE,
        name: args.name,
        provider: args.provider,
      }),
    });
  }

  async createApiKey(args: { name: string; expiresIn?: number; companyId: string }): Promise<CreateApiKeyResult> {
    const { companyId, ...body } = args;
    try {
      const requestHeaders = await headers();
      const data = await auth.api.createApiKey({
        body,
        headers: requestHeaders,
      });

      if (!(await bindApiKeyToCompany(data.id, data.referenceId, companyId))) {
        await auth.api.deleteApiKey({ body: { keyId: data.id }, headers: requestHeaders });
        throw new Error("API key could not be bound to its workspace");
      }

      return { ok: true, data };
    } catch (error) {
      if (error instanceof APIError && error.body?.code === API_KEY_ERROR_CODES.EXPIRES_IN_IS_TOO_SMALL.code)
        return { ok: false, error: CustomErrorCode.apiKeyMinExpiration };
      if (error instanceof APIError && error.body?.code === API_KEY_ERROR_CODES.EXPIRES_IN_IS_TOO_LARGE.code)
        return { ok: false, error: CustomErrorCode.apiKeyMaxExpiration };
      if (error instanceof APIError && error.body?.code === API_KEY_ERROR_CODES.INVALID_NAME_LENGTH.code)
        return { ok: false, error: CustomErrorCode.apiKeyNameLength };

      throw error;
    }
  }

  async deleteApiKey(keyId: string, companyId: string): Promise<boolean> {
    const key = await prisma.apikey.findUnique({ where: { id: keyId }, select: { companyId: true } });
    if (!key || key.companyId !== companyId) return false;

    await auth.api.deleteApiKey({
      body: { keyId },
      headers: await headers(),
    });
    return true;
  }

  async listApiKeys(companyId: string) {
    const result = await auth.api.listApiKeys({
      headers: await headers(),
    });
    const ids = result.apiKeys.map((key) => key.id);
    const bound = ids.length
      ? await prisma.apikey.findMany({ where: { id: { in: ids }, companyId }, select: { id: true } })
      : [];
    const boundIds = new Set(bound.map((key) => key.id));
    return result.apiKeys.filter((key) => boundIds.has(key.id));
  }

  async resolveApiKeyReferences(
    ownerAuthUserId: string,
    ids: string[],
    companyId: string,
  ): Promise<{ active: Set<string>; foreign: Set<string> }> {
    const keys = ids.length
      ? await prisma.apikey.findMany({
          where: { id: { in: ids } },
          select: { id: true, referenceId: true, companyId: true, enabled: true, expiresAt: true },
        })
      : [];
    const now = Date.now();
    const active = new Set<string>();
    const foreign = new Set<string>();

    for (const key of keys) {
      if (key.referenceId !== ownerAuthUserId || key.companyId !== companyId) foreign.add(key.id);
      else if (key.enabled !== false && (!key.expiresAt || key.expiresAt.getTime() > now)) active.add(key.id);
    }

    return { active, foreign };
  }

  async getMcpConsentPrompt(args: {
    consentCode: string;
    clientId: string;
  }): Promise<{ clientName: string; scopes: string[]; redirectHost: string; workspaceId: string | null } | null> {
    const resolved = await this.resolvePendingConsent(args.consentCode);
    if (!resolved) return null;
    if (resolved.value.clientId !== args.clientId) return null;

    const application = await prisma.oauthApplication.findUnique({ where: { clientId: resolved.value.clientId } });
    if (!application) return null;

    return {
      clientName: application.name,
      scopes: this.consentScopeList(resolved.value.scope),
      redirectHost: this.redirectHost(resolved.value.redirectURI),
      workspaceId: mcpResourceWorkspaceOf(resolved.value),
    };
  }

  async getMcpConsentWorkspace(consentCode: string): Promise<string | null> {
    const resolved = await this.resolvePendingConsent(consentCode);
    return resolved ? mcpResourceWorkspaceOf(resolved.value) : null;
  }

  async bindMcpAuthorizationResource(consentCode: string, companyId: string): Promise<void> {
    const verification = await prisma.authVerification.findFirst({ where: { identifier: consentCode } });
    const value = verification ? this.parseConsentValue(verification.value) : null;
    if (!verification || !value) throw new Error("The MCP authorization request could not be bound to its workspace");

    await prisma.authVerification.update({
      where: { id: verification.id },
      data: { value: JSON.stringify(withMcpResourceWorkspace(value, companyId)) },
    });
  }

  async decideMcpConsent(args: {
    consentCode: string;
    accept: boolean;
    companyId: string | null;
  }): Promise<{ redirectURI: string } | null> {
    const resolved = await this.resolvePendingConsent(args.consentCode);
    if (!resolved) return null;

    const { verification, value } = resolved;
    const redirectUrl = new URL(value.redirectURI);
    const resourceCompanyId = mcpResourceWorkspaceOf(value);

    if (!args.accept || !args.companyId || (resourceCompanyId !== null && resourceCompanyId !== args.companyId)) {
      await prisma.authVerification.delete({ where: { id: verification.id } });
      redirectUrl.searchParams.set("error", "access_denied");
      if (value.state) redirectUrl.searchParams.set("state", value.state);

      return { redirectURI: redirectUrl.toString() };
    }

    const code = nanoid(32);
    const scopes = this.consentScopeList(value.scope).join(" ");

    await prisma.authVerification.update({
      where: { id: verification.id },
      data: { identifier: code, value: JSON.stringify(approveMcpAuthorizationCodeValue(value)) },
    });
    await prisma.authVerification.create({
      data: {
        id: crypto.randomUUID(),
        identifier: mcpAuthorizationCodeWorkspaceIdentifier(code),
        value: args.companyId,
        expiresAt: new Date(Date.now() + MCP_CODE_WORKSPACE_TTL_MS),
      },
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

  async consumeMcpAuthorizationCodeWorkspace(code: string): Promise<string | null> {
    const identifier = mcpAuthorizationCodeWorkspaceIdentifier(code);
    const binding = await prisma.authVerification.findFirst({ where: { identifier } });
    if (!binding) return null;

    await prisma.authVerification.deleteMany({ where: { identifier } });
    return binding.expiresAt.getTime() > Date.now() ? binding.value : null;
  }

  private handleError(source: unknown): AuthResult {
    const ERROR_MAP: Record<string, CustomErrorCode> = {
      EMAIL_NOT_VERIFIED: CustomErrorCode.emailNotVerified,
      INVALID_EMAIL_OR_PASSWORD: CustomErrorCode.invalidCredentials,
      PASSWORD_TOO_SHORT: CustomErrorCode.passwordInvalid,
      PASSWORD_TOO_LONG: CustomErrorCode.passwordInvalid,
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

  private hasCookie(headersList: Headers, name: string): boolean {
    return (headersList.get("cookie") ?? "").split(";").some((part) => {
      const separator = part.indexOf("=");
      return separator > 0 && part.slice(0, separator).trim() === name;
    });
  }

  private hasBearerToken(headersList: Headers): boolean {
    return (headersList.get("authorization") ?? "").toLowerCase().startsWith("bearer ");
  }

  async isIntegrationCredentialRequest(): Promise<boolean> {
    const headersList = await headers();
    return headersList.has("x-api-key") || this.hasBearerToken(headersList);
  }

  async isMcpApiKeyValid(headersList: Headers): Promise<boolean> {
    const key = headersList.get("x-api-key");
    if (!key) return false;
    try {
      return (await auth.api.getSession({ headers: new Headers({ "x-api-key": key }) })) !== null;
    } catch {
      return false;
    }
  }

  async isMcpBearerValid(headersList: Headers): Promise<boolean> {
    try {
      return (await this.resolveMcpBearerSession(headersList)) !== null;
    } catch {
      return false;
    }
  }

  async resolveMcpCredentialWorkspace(headersList: Headers): Promise<McpCredentialWorkspace | null> {
    const key = headersList.get("x-api-key");
    try {
      const session = key
        ? await auth.api.getSession({ headers: new Headers({ "x-api-key": key }) })
        : await this.resolveMcpBearerSession(headersList);
      if (!session) return null;

      const binding = await this.getCredentialWorkspace(session, headersList);
      return {
        credential: key ? "apiKey" : "bearer",
        companyId: binding.kind === "integration" ? binding.companyId : null,
      };
    } catch {
      return null;
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
