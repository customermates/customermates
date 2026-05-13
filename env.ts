function readBoolean(key: string): boolean {
  return process.env[key] === "true";
}

function readEnum<T extends string>(key: string, values: readonly T[]): T | undefined {
  const value = process.env[key];
  return value && (values as readonly string[]).includes(value) ? (value as T) : undefined;
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL as string,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET as string,
  BASE_URL: process.env.BASE_URL ?? "http://localhost:4000",

  NODE_ENV: readEnum("NODE_ENV", ["development", "test", "production"] as const) ?? "development",
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  NEXT_RUNTIME: readEnum("NEXT_RUNTIME", ["nodejs", "edge"] as const),
  CI: process.env.CI,

  DEMO_MODE: readBoolean("DEMO_MODE"),
  CLOUD_HOSTED: readBoolean("CLOUD_HOSTED"),

  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_OPERATOR_EMAIL: process.env.RESEND_OPERATOR_EMAIL as string,

  TRIGGER_SECRET_KEY: process.env.TRIGGER_SECRET_KEY,
  TRIGGER_PROJECT_REF: process.env.TRIGGER_PROJECT_REF as string,

  SENTRY_ORG: process.env.SENTRY_ORG,
  SENTRY_PROJECT: process.env.SENTRY_PROJECT,
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  SENTRY_DSN: process.env.SENTRY_DSN,

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
  AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,

  LEMONSQUEEZY_API_KEY: process.env.LEMONSQUEEZY_API_KEY,
  LEMONSQUEEZY_WEBHOOK_SECRET: process.env.LEMONSQUEEZY_WEBHOOK_SECRET,
  LEMONSQUEEZY_STORE_ID: process.env.LEMONSQUEEZY_STORE_ID,
  LEMONSQUEEZY_VARIANT_ID_MONTHLY: process.env.LEMONSQUEEZY_VARIANT_ID_MONTHLY,
  LEMONSQUEEZY_VARIANT_ID_YEARLY: process.env.LEMONSQUEEZY_VARIANT_ID_YEARLY,

  DEMO_USER_EMAIL: process.env.DEMO_USER_EMAIL,
  DEMO_USER_PASSWORD: process.env.DEMO_USER_PASSWORD,
};
