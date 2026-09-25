import { prismaAdapter } from "better-auth/adapters/prisma";
import { oAuthProxy, mcp } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { nextCookies } from "better-auth/next-js";
import { betterAuth } from "better-auth/minimal";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/prisma/db";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { env } from "@/env";
import { callbackUrlSchema } from "@/features/auth/callback-url.schema";
import { onboardingIntentFromPath, pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";
import { API_KEY_MAX_EXPIRATION_DAYS, API_KEY_MIN_EXPIRATION_DAYS } from "@/features/api-key/api-key-expiration";
import { API_KEY_NAME_MAX_LENGTH, API_KEY_NAME_MIN_LENGTH } from "@/features/api-key/api-key-name";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/core/validation/validation.utils";

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
            if (authUser) {
              await runWithoutTenant(() =>
                prisma.user.updateMany({
                  where: { email: authUser.email },
                  data: { lastActiveAt: new Date() },
                }),
              );
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
      enabled: true,
      maxAge: env.APP_MODE === "demo" ? 30 * 24 * 60 * 60 : 5 * 60,
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
      resource: `${env.BASE_URL}/api/v1/mcp`,
      oidcConfig: {
        loginPage: "/auth/signin",
        consentPage: "/auth/mcp-consent",
        requirePKCE: true,
        allowPlainCodeChallengeMethod: false,
        accessTokenExpiresIn: 3600,
        refreshTokenExpiresIn: 60 * 60 * 24 * 30,
      },
    }),
    nextCookies(),
  ],
});

async function revokeUnprovenAccess(userId: string, options: { removeAccounts: boolean }): Promise<number> {
  const accounts = options.removeAccounts ? await prisma.authAccount.deleteMany({ where: { userId } }) : { count: 0 };
  const sessions = await prisma.authSession.deleteMany({ where: { userId } });
  const apiKeys = await prisma.apikey.deleteMany({ where: { referenceId: userId } });
  const tokens = await prisma.oauthAccessToken.deleteMany({ where: { userId } });
  const consents = await prisma.oauthConsent.deleteMany({ where: { userId } });

  return accounts.count + sessions.count + apiKeys.count + tokens.count + consents.count;
}
