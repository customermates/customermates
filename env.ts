import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BASE_URL: z.url().default("http://localhost:4000"),

    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
    NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),
    CI: z.string().optional(),

    DEMO_MODE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    CLOUD_HOSTED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),

    RESEND_API_KEY: z.string().optional(),
    RESEND_OPERATOR_EMAIL: z.email(),

    TRIGGER_SECRET_KEY: z.string().optional(),
    TRIGGER_PROJECT_REF: z.string(),

    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    AZURE_AD_CLIENT_ID: z.string().optional(),
    AZURE_AD_CLIENT_SECRET: z.string().optional(),

    LEMONSQUEEZY_API_KEY: z.string().optional(),
    LEMONSQUEEZY_WEBHOOK_SECRET: z.string().optional(),
    LEMONSQUEEZY_STORE_ID: z.string().optional(),
    LEMONSQUEEZY_VARIANT_ID_MONTHLY: z.string().optional(),
    LEMONSQUEEZY_VARIANT_ID_YEARLY: z.string().optional(),

    DEMO_USER_EMAIL: z.email().optional(),
    DEMO_USER_PASSWORD: z.string().optional(),
  },
  client: {},
  shared: {
    SENTRY_DSN: z.url().optional(),
  },
  runtimeEnv: process.env as Record<string, string | undefined>,
});
