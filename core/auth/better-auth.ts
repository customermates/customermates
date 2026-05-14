import { prismaAdapter } from "better-auth/adapters/prisma";
import { oAuthProxy, apiKey } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { betterAuth } from "better-auth/minimal";

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

export const auth = betterAuth({
  baseURL: env.BASE_URL,

  advanced: {
    cookiePrefix: "app",
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

          const { getInviteTokenValidationInteractor } = await import("@/core/app-di");
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
          const authUser = await prisma.authUser.findUnique({ where: { id: session.userId } });
          if (authUser) {
            await runWithoutTenant(() =>
              prisma.user.updateMany({
                where: { email: authUser.email },
                data: { lastActiveAt: new Date() },
              }),
            );
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
      maxAge: env.DEMO_MODE ? 30 * 24 * 60 * 60 : 5 * 60,
    },
  },

  verification: {
    modelName: "AuthVerification",
  },

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      const { getAuthService } = await import("@/core/app-di");
      await getAuthService().sendResetPasswordEmail({ to: user.email, url });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const verificationUrl = new URL(url);
      verificationUrl.searchParams.set("callbackURL", "/onboarding/wizard");

      const { getAuthService } = await import("@/core/app-di");
      await getAuthService().sendVerificationEmail({ to: user.email, url: verificationUrl.toString() });
    },
  },

  socialProviders,

  plugins: [
    oAuthProxy(),
    nextCookies(),
    apiKey({
      rateLimit: {
        enabled: false,
      },
      enableSessionForAPIKeys: true,
    }),
  ],
});
