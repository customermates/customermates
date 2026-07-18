import { prismaAdapter } from "better-auth/adapters/prisma";
import { oAuthProxy, mcp } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { nextCookies } from "better-auth/next-js";
import { betterAuth } from "better-auth/minimal";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/prisma/db";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { env } from "@/env";

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

export const auth = betterAuth({
  baseURL: env.BASE_URL,

  advanced: {
    cookiePrefix: "app",
  },

  rateLimit: {
    customRules: {
      "/mcp/register": { window: 3600, max: 10 },
    },
  },

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  trustedOrigins: [env.BASE_URL, `https://*.${env.VERCEL_PROJECT_PRODUCTION_URL}`],

  databaseHooks: {
    user: {
      create: {
        before: async (data, ctx) => {
          const inviteToken = ctx?.getCookie("inviteToken");

          if (!inviteToken) return { data };

          const { getInviteTokenValidationInteractor } = await import("@/core/di");
          const result = await getInviteTokenValidationInteractor().invoke({ token: inviteToken });
          const res = result.data;

          if (!res.valid && res.errorMessage === "inviteLinkExpired") {
            const { redirect } = await import("next/navigation");
            redirect("/auth/error?type=inviteLinkExpired");
          }

          return {
            data: res.valid ? { ...data, companyId: res.companyId } : { ...data },
          };
        },
      },
    },
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
    sendResetPassword: async ({ user, url }) => {
      const { getAuthService } = await import("@/core/di");
      await getAuthService().sendResetPasswordEmail({ to: user.email, url });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const verificationUrl = new URL(url);
      verificationUrl.searchParams.set("callbackURL", "/onboarding/wizard");

      const { getAuthService } = await import("@/core/di");
      await getAuthService().sendVerificationEmail({ to: user.email, url: verificationUrl.toString() });
    },
  },

  socialProviders,

  plugins: [
    oAuthProxy({ currentURL: env.BASE_URL }),
    apiKey({
      rateLimit: {
        enabled: false,
      },
      enableSessionForAPIKeys: true,
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
