import { prismaAdapter } from "better-auth/adapters/prisma";
import { oAuthProxy, mcp } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { nextCookies } from "better-auth/next-js";
import { betterAuth } from "better-auth/minimal";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/prisma/db";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getTransactionClient } from "@/core/decorators/transaction-context";
import { env } from "@/env";
import { callbackUrlSchema } from "@/features/auth/callback-url.schema";
import { onboardingIntentFromPath, pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";
import { API_KEY_MAX_EXPIRATION_DAYS, API_KEY_MIN_EXPIRATION_DAYS } from "@/features/api-key/api-key-expiration";
import { API_KEY_NAME_MAX_LENGTH, API_KEY_NAME_MIN_LENGTH } from "@/features/api-key/api-key-name";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/core/validation/validation.utils";
import { apiKeyRouteAction, decideApiKeyRoute } from "@/core/auth/api-key-route-guard";
import {
  MCP_AUTHORIZE_PATH,
  MCP_CONSENT_PAGE_PATH,
  MCP_LIBRARY_CONSENT_PATH,
  MCP_TOKEN_PATH,
  authorizationCodeFromTokenRequest,
  consentCodeFromAuthorizeRedirect,
  isApprovedMcpAuthorizationCodeValue,
  issuedAccessToken,
  resourceFromTokenRequest,
  tokenGrantFromRequest,
} from "@/features/auth/mcp-authorization-code";
import { MCP_ENDPOINT_PATH, mcpWorkspaceIdFromResource } from "@/features/auth/mcp-resource";

const socialProviders = {
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {}),
  ...(env.AZURE_AD_CLIENT_ID && env.AZURE_AD_CLIENT_SECRET
    ? {
        microsoft: {
          clientId: env.AZURE_AD_CLIENT_ID,
          clientSecret: env.AZURE_AD_CLIENT_SECRET,
          tenantId: "common",
        },
      }
    : {}),
};

export const enabledSocialProviders = {
  google: "google" in socialProviders,
  microsoft: "microsoft" in socialProviders,
};

const oauthProxy =
  env.OAUTH_PROXY_URL && env.OAUTH_PROXY_SECRET
    ? oAuthProxy({
        productionURL: env.OAUTH_PROXY_URL,
        secret: env.OAUTH_PROXY_SECRET,
      })
    : null;

const baseUrlProtocol = new URL(env.BASE_URL).protocol === "https:" ? "https" : "http";

const VERIFIED_LANDING_PATH = "/auth/verify-email?verified=1";

export const auth = betterAuth({
  baseURL: {
    allowedHosts: env.AUTH_ALLOWED_HOSTS,
    fallback: env.BASE_URL,
    protocol: baseUrlProtocol,
  },

  advanced: {
    cookiePrefix: "app",
    useSecureCookies: baseUrlProtocol === "https",
  },

  disabledPaths: [MCP_LIBRARY_CONSENT_PATH],

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const apiKeyAction = apiKeyRouteAction(ctx.path);
      if (apiKeyAction) {
        if (ctx.request) throw new APIError("NOT_FOUND", { code: "NOT_FOUND", message: "Not found" });

        const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
        if (!session) return;

        const { getActiveWorkspaceService } = await import("@/core/di");
        const member = await runWithoutTenant(() =>
          getActiveWorkspaceService().resolveMembership(session, ctx.headers ?? new Headers()),
        );
        const decision = decideApiKeyRoute(apiKeyAction, member);
        if (decision === "inactive")
          throw new APIError("FORBIDDEN", { code: "USER_INACTIVE", message: "User is not active" });
        if (decision === "permissionDenied") {
          throw new APIError("FORBIDDEN", {
            code: "PERMISSION_DENIED",
            message: `Access denied. Required permissions: ${apiKeyAction} on api`,
          });
        }
        return;
      }

      if (ctx.path !== MCP_TOKEN_PATH) return;

      const code = authorizationCodeFromTokenRequest(ctx.body);
      if (code === null) return;

      const verification = code
        ? await prisma.authVerification.findFirst({ where: { identifier: code }, select: { value: true } })
        : null;
      if (isApprovedMcpAuthorizationCodeValue(verification?.value)) return;

      throw new APIError("UNAUTHORIZED", {
        error: "invalid_grant",
        error_description: "authorization code was not approved",
      });
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === MCP_AUTHORIZE_PATH) {
        const resourceCompanyId = mcpWorkspaceIdFromResource(ctx.query?.resource, env.BASE_URL);
        const consentCode = consentCodeFromAuthorizeRedirect(
          ctx.context.responseHeaders?.get("location"),
          env.BASE_URL,
        );
        if (!resourceCompanyId || !consentCode) return;

        const { getAuthService } = await import("@/core/di");
        await getAuthService().bindMcpAuthorizationResource(consentCode, resourceCompanyId);
        return;
      }

      if (ctx.path !== MCP_TOKEN_PATH) return;

      const accessToken = issuedAccessToken(ctx.context.returned);
      if (!accessToken) return;

      const grant = tokenGrantFromRequest(ctx.body);
      const { getAuthService } = await import("@/core/di");
      const companyId =
        grant?.type === "authorization_code"
          ? await getAuthService().consumeMcpAuthorizationCodeWorkspace(grant.code)
          : grant?.type === "refresh_token"
            ? ((
                await prisma.oauthAccessToken.findUnique({
                  where: { refreshToken: grant.refreshToken },
                  select: { companyId: true },
                })
              )?.companyId ?? null)
            : null;

      if (!companyId) {
        await prisma.oauthAccessToken.deleteMany({ where: { accessToken } });
        throw new APIError("UNAUTHORIZED", {
          error: "invalid_grant",
          error_description: "the grant is not bound to a workspace",
        });
      }

      const requestedCompanyId = mcpWorkspaceIdFromResource(resourceFromTokenRequest(ctx.body), env.BASE_URL);
      if (requestedCompanyId && requestedCompanyId !== companyId) {
        await prisma.oauthAccessToken.deleteMany({ where: { accessToken } });
        throw new APIError("BAD_REQUEST", {
          error: "invalid_target",
          error_description: "the grant is bound to another workspace than the requested resource",
        });
      }

      await prisma.oauthAccessToken.update({ where: { accessToken }, data: { companyId } });
    }),
  },

  rateLimit: {
    customRules: {
      "/mcp/register": { window: 3600, max: 10 },
      "/send-verification-email": { window: 3600, max: 10 },
    },
  },

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          try {
            const authUser = await prisma.authUser.findUnique({ where: { id: session.userId } });
            if (authUser?.companyId) {
              const { getUserRepo } = await import("@/core/di");
              await getUserRepo().markMembershipActiveUnscoped(authUser.email, authUser.companyId);
            }
          } catch (error) {
            Sentry.captureException(error);
          }
        },
      },
    },
    account: {
      create: {
        before: async (account) => {
          if (account.providerId === "credential") return;

          const authUser = await prisma.authUser.findUnique({
            where: { id: account.userId },
            select: { email: true, emailVerified: true },
          });
          if (!authUser || authUser.emailVerified) return;

          const removed = await revokeUnprovenAccess(account.userId, { removeAccounts: true });
          if (removed === 0) return;

          try {
            const { getAuthService } = await import("@/core/di");
            await getAuthService().sendAccountAccessRevokedEmail({ to: authUser.email });
          } catch (error) {
            Sentry.captureException(error);
          }
        },
      },
    },
  },

  user: {
    modelName: "AuthUser",
    additionalFields: {
      companyId: {
        type: "string",
        required: false,
        defaultValue: null,
        input: false,
      },
    },
  },

  account: {
    modelName: "AuthAccount",
    accountLinking: {
      requireLocalEmailVerified: false,
    },
  },

  session: {
    modelName: "AuthSession",
    cookieCache: {
      enabled: env.APP_MODE === "demo",
      maxAge: 30 * 24 * 60 * 60,
    },
  },

  verification: {
    modelName: "AuthVerification",
  },

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    onPasswordReset: async ({ user }) => {
      if (user.emailVerified) return;

      await revokeUnprovenAccess(user.id, { removeAccounts: false });
    },
    sendResetPassword: async ({ user, url }) => {
      const { getAuthService } = await import("@/core/di");
      await getAuthService().sendResetPasswordEmail({ to: user.email, url });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    expiresIn: 24 * 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      const verificationUrl = new URL(url);
      const requested = verificationUrl.searchParams.get("callbackURL") ?? undefined;
      const onboardingIntent = onboardingIntentFromPath(
        requested && callbackUrlSchema.safeParse(requested).success ? requested : undefined,
      );
      verificationUrl.searchParams.set(
        "callbackURL",
        onboardingIntent.status === "valid"
          ? pathWithOnboardingIntent(VERIFIED_LANDING_PATH, onboardingIntent.intent)
          : VERIFIED_LANDING_PATH,
      );

      const { getAuthService } = await import("@/core/di");
      await getAuthService().sendVerificationEmail({ to: user.email, url: verificationUrl.toString() });
    },
  },

  socialProviders,

  plugins: [
    ...(oauthProxy ? [oauthProxy] : []),
    apiKey({
      rateLimit: {
        enabled: false,
      },
      enableSessionForAPIKeys: true,
      minimumNameLength: API_KEY_NAME_MIN_LENGTH,
      maximumNameLength: API_KEY_NAME_MAX_LENGTH,
      keyExpiration: {
        minExpiresIn: API_KEY_MIN_EXPIRATION_DAYS,
        maxExpiresIn: API_KEY_MAX_EXPIRATION_DAYS,
      },
    }),
    mcp({
      loginPage: "/auth/signin",
      resource: `${env.BASE_URL}${MCP_ENDPOINT_PATH}`,
      oidcConfig: {
        loginPage: "/auth/signin",
        consentPage: MCP_CONSENT_PAGE_PATH,
        requirePKCE: true,
        allowPlainCodeChallengeMethod: false,
        accessTokenExpiresIn: 3600,
        refreshTokenExpiresIn: 60 * 60 * 24 * 30,
      },
    }),
    nextCookies(),
  ],
});

export async function bindApiKeyToCompany(keyId: string, authUserId: string, companyId: string): Promise<boolean> {
  const bound = await prisma.apikey.updateMany({
    where: { id: keyId, referenceId: authUserId, companyId: null },
    data: { companyId },
  });
  return bound.count === 1;
}

export async function revokeMembershipCredentials(authUserId: string, companyId: string): Promise<number> {
  const apiKeys = await (getTransactionClient<typeof prisma>() ?? prisma).apikey.deleteMany({
    where: { referenceId: authUserId, companyId },
  });
  const tokens = await (getTransactionClient<typeof prisma>() ?? prisma).oauthAccessToken.deleteMany({
    where: { userId: authUserId, companyId },
  });
  return apiKeys.count + tokens.count;
}

export async function deleteApiKeysForIdentities(identityIds: string[]): Promise<void> {
  await (getTransactionClient<typeof prisma>() ?? prisma).apikey.deleteMany({
    where: { referenceId: { in: identityIds } },
  });
}

async function revokeUnprovenAccess(userId: string, options: { removeAccounts: boolean }): Promise<number> {
  const accounts = options.removeAccounts ? await prisma.authAccount.deleteMany({ where: { userId } }) : { count: 0 };
  const sessions = await prisma.authSession.deleteMany({ where: { userId } });
  const apiKeys = await prisma.apikey.deleteMany({ where: { referenceId: userId } });
  const tokens = await prisma.oauthAccessToken.deleteMany({ where: { userId } });
  const { getAuthService } = await import("@/core/di");
  const consents = await getAuthService().revokeOauthConsents(userId);

  return accounts.count + sessions.count + apiKeys.count + tokens.count + consents;
}
