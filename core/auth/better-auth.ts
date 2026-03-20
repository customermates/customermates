import { prismaAdapter } from "better-auth/adapters/prisma";
import { oAuthProxy, apiKey } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { redirect } from "next/navigation";
import { betterAuth } from "better-auth/minimal";

import { prisma } from "@/prisma/db";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { BASE_URL, IS_DEMO_MODE } from "@/constants/env";

const socialProviders = {
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {}),
  ...(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET
    ? {
        microsoft: {
          clientId: process.env.AZURE_AD_CLIENT_ID,
          clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
          tenantId: "common",
        },
      }
    : {}),
};

export const auth = betterAuth({
  baseURL: BASE_URL,

  advanced: {
    cookiePrefix: "app",
  },

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  trustedOrigins: [BASE_URL, `https://*.${process.env.VERCEL_PROJECT_PRODUCTION_URL}`],

  databaseHooks: {
    user: {
      create: {
        before: async (data, ctx) => {
          const inviteToken = ctx?.getCookie("inviteToken");

          if (!inviteToken) return { data };

          const { di } = await import("@/core/dependency-injection/container");
          const { InviteTokenValidationInteractor } = await import(
            "@/features/company/invite-token-validation.interactor"
          );
          const res = await di.get(InviteTokenValidationInteractor).invoke({ token: inviteToken });

          if (!res.valid && res.errorMessage === "inviteLinkExpired") redirect("/auth/error?type=inviteLinkExpired");

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
      maxAge: IS_DEMO_MODE ? 30 * 24 * 60 * 60 : 5 * 60,
    },
  },

  verification: {
    modelName: "AuthVerification",
  },

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      const { di } = await import("@/core/dependency-injection/container");
      const { AuthService } = await import("@/features/auth/auth.service");
      await di.get(AuthService).sendResetPasswordEmail({ to: user.email, url });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const verificationUrl = new URL(url);
      verificationUrl.searchParams.set("callbackURL", "/onboarding");

      const { di } = await import("@/core/dependency-injection/container");
      const { AuthService } = await import("@/features/auth/auth.service");
      await di.get(AuthService).sendVerificationEmail({ to: user.email, url: verificationUrl.toString() });
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
