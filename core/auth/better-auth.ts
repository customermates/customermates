import { prismaAdapter } from "better-auth/adapters/prisma";
import { oAuthProxy, mcp } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { nextCookies } from "better-auth/next-js";
import { betterAuth } from "better-auth/minimal";
import { z } from "zod";
import { APIError, createAuthMiddleware, getOAuthState, getSessionFromCtx } from "better-auth/api";
import * as ErrorReporter from "@/core/observability/server";

import { prisma } from "@/prisma/db";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getTransactionClient } from "@/core/decorators/transaction-context";
import { env } from "@/env";
import { callbackUrlSchema } from "@/features/auth/callback-url.schema";
import { SignupLastPageSchema } from "@/features/acquisition/signup-last-page";
import { EncodedSignupCampaignSchema } from "@/features/acquisition/signup-campaign";
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

const CHANGE_PASSWORD_PATH = "/change-password";

const API_KEY_HEADER = "x-api-key";

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
      if (ctx.request && (ctx.request.headers.has(API_KEY_HEADER) || ctx.headers?.has(API_KEY_HEADER))) {
        throw new APIError("FORBIDDEN", {
          code: "API_KEY_NOT_ACCEPTED",
          message: "API keys are not accepted on the auth endpoints",
        });
      }

      if (ctx.path === CHANGE_PASSWORD_PATH) return { context: { body: { ...ctx.body, revokeOtherSessions: true } } };

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
      if (ctx.path === CHANGE_PASSWORD_PATH) {
        const userId = changedPasswordUserId(ctx.context.returned);
        if (userId) await revokeOauthTokens(userId);
        return;
      }

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
      const binding =
        grant?.type === "authorization_code"
          ? await getAuthService().consumeMcpAuthorizationCodeWorkspace(grant.code)
          : grant?.type === "refresh_token"
            ? await prisma.oauthAccessToken.findUnique({
                where: { refreshToken: grant.refreshToken },
                select: { companyId: true },
              })
            : null;

      if (!binding) {
        await prisma.oauthAccessToken.deleteMany({ where: { accessToken } });
        throw new APIError("UNAUTHORIZED", {
          error: "invalid_grant",
          error_description: "the grant was not approved on the consent screen",
        });
      }

      const { companyId } = binding;
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
    user: {
      create: {
        before: async (user) => {
          const state = await getOAuthState();
          const lastPage = SignupLastPageSchema.safeParse(state?.signupLastPage);
          const campaign = EncodedSignupCampaignSchema.safeParse(state?.signupCampaign);
          if (!lastPage.success && !campaign.success) return undefined;
          return {
            data: {
              ...user,
              ...(lastPage.success ? { signupLastPage: lastPage.data } : {}),
              ...(campaign.success ? { signupCampaign: campaign.data } : {}),
            },
          };
        },
      },
    },
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
            ErrorReporter.captureException(error);
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
            ErrorReporter.captureException(error);
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
      signupLastPage: {
        type: "string",
        required: false,
        defaultValue: null,
        input: false,
        returned: false,
      },
      signupCampaign: {
        type: "string",
        required: false,
        defaultValue: null,
        input: false,
        returned: false,
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
    revokeSessionsOnPasswordReset: true,
    onPasswordReset: async ({ user }) => {
      if (user.emailVerified) {
        await revokeOauthTokens(user.id);
        return;
      }

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
      apiKeyHeaders: API_KEY_HEADER,
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

export async function issueExpiringApiKey(args: {
  authUserId: string;
  companyId: string;
  name: string;
  expiresAt: Date;
  metadata?: string;
}): Promise<{ id: string; key: string }> {
  const created = await auth.api.createApiKey({
    body: { name: args.name, userId: args.authUserId, expiresIn: API_KEY_MIN_EXPIRATION_DAYS * 24 * 60 * 60 },
  });
  const bound = await prisma.apikey.updateMany({
    where: { id: created.id, referenceId: args.authUserId, companyId: null },
    data: {
      companyId: args.companyId,
      expiresAt: args.expiresAt,
      ...(args.metadata === undefined ? {} : { metadata: args.metadata }),
    },
  });
  if (bound.count !== 1) {
    await prisma.apikey.deleteMany({ where: { id: created.id } });
    throw new Error("API key could not be bound to its workspace");
  }
  return { id: created.id, key: created.key };
}

export async function revokeApiKeysNamed(companyId: string, name: string): Promise<number> {
  const removed = await prisma.apikey.deleteMany({ where: { companyId, name } });
  return removed.count;
}

export async function apiKeyRequestsNamed(companyId: string, name: string): Promise<number> {
  const used = await prisma.apikey.aggregate({ where: { companyId, name }, _sum: { requestCount: true } });
  return used._sum.requestCount ?? 0;
}

export async function countApiKeyRequest(keyId: string, limit: number): Promise<boolean> {
  const counted = await prisma.apikey.updateMany({
    where: { id: keyId, requestCount: { lt: limit } },
    data: { requestCount: { increment: 1 } },
  });
  return counted.count === 1;
}

export async function revokeMembershipCredentials(authUserId: string, companyId: string): Promise<number> {
  const apiKeys = await (getTransactionClient<typeof prisma>() ?? prisma).apikey.deleteMany({
    where: { referenceId: authUserId, companyId },
  });
  await (getTransactionClient<typeof prisma>() ?? prisma).oauthAccessToken.updateMany({
    where: { userId: authUserId, companyId },
    data: { companyId: null },
  });
  return apiKeys.count;
}

export async function revokeOauthClientTokens(args: { authUserId: string; clientId: string }): Promise<number> {
  const tokens = await (getTransactionClient<typeof prisma>() ?? prisma).oauthAccessToken.deleteMany({
    where: { userId: args.authUserId, clientId: args.clientId },
  });
  return tokens.count;
}

export async function deleteApiKeysForIdentities(identityIds: string[]): Promise<void> {
  await (getTransactionClient<typeof prisma>() ?? prisma).apikey.deleteMany({
    where: { referenceId: { in: identityIds } },
  });
}

async function revokeOauthTokens(userId: string): Promise<void> {
  await prisma.oauthAccessToken.deleteMany({ where: { userId } });
}

const ChangedPasswordResultSchema = z.object({ user: z.object({ id: z.string() }) });

function changedPasswordUserId(returned: unknown): string | null {
  const result = ChangedPasswordResultSchema.safeParse(returned);
  return result.success ? result.data.user.id : null;
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
