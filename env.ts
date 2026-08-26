import { normalizeBaseUrl, resolveAppMode, resolveAuthAllowedHosts, resolveBaseUrl } from "@/core/config/environment";

const BASE_URL = resolveBaseUrl(process.env);
const oauthProxyUrl = process.env.OAUTH_PROXY_URL?.trim();
const oauthProxySecret = process.env.OAUTH_PROXY_SECRET?.trim() ? process.env.OAUTH_PROXY_SECRET : undefined;
if (Boolean(oauthProxyUrl) !== Boolean(oauthProxySecret))
  throw new Error("OAUTH_PROXY_URL and OAUTH_PROXY_SECRET must be configured together");

export const env = {
  DATABASE_URL: process.env.DATABASE_URL as string,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET as string,
  BASE_URL,
  AUTH_ALLOWED_HOSTS: resolveAuthAllowedHosts(process.env, BASE_URL),
  OAUTH_PROXY_URL: oauthProxyUrl ? normalizeBaseUrl(oauthProxyUrl, "OAUTH_PROXY_URL") : undefined,
  OAUTH_PROXY_SECRET: oauthProxySecret,

  NODE_ENV: (process.env.NODE_ENV as "development" | "test" | "production" | undefined) ?? "development",
  VERCEL_ENV: process.env.VERCEL_ENV as "development" | "preview" | "production" | undefined,
  NEXT_RUNTIME: process.env.NEXT_RUNTIME as "nodejs" | "edge" | undefined,
  CI: process.env.CI,

  APP_MODE: resolveAppMode(process.env),
  AGENT_CHAT_DISABLED: Boolean(process.env.AGENT_CHAT_DISABLED),
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,

  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_OPERATOR_EMAIL: process.env.RESEND_OPERATOR_EMAIL as string,

  WORKFLOW_TARGET_WORLD: process.env.WORKFLOW_TARGET_WORLD,
  CRON_SECRET: process.env.CRON_SECRET,

  SENTRY_ORG: process.env.SENTRY_ORG,
  SENTRY_PROJECT: process.env.SENTRY_PROJECT,
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
  AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,

  LEMONSQUEEZY_API_KEY: process.env.LEMONSQUEEZY_API_KEY,
  LEMONSQUEEZY_WEBHOOK_SECRET: process.env.LEMONSQUEEZY_WEBHOOK_SECRET,
  LEMONSQUEEZY_STORE_ID: process.env.LEMONSQUEEZY_STORE_ID,
  LEMONSQUEEZY_VARIANT_ID_STARTER: process.env.LEMONSQUEEZY_VARIANT_ID_STARTER,
  LEMONSQUEEZY_VARIANT_ID_PRO: process.env.LEMONSQUEEZY_VARIANT_ID_PRO,
  LEMONSQUEEZY_VARIANT_ID_BUSINESS: process.env.LEMONSQUEEZY_VARIANT_ID_BUSINESS,

  UNIPILE_API_KEY: process.env.UNIPILE_API_KEY,
  UNIPILE_WEBHOOK_SECRET: process.env.UNIPILE_WEBHOOK_SECRET,
  UNIPILE_HOSTED_AUTH_DOMAIN: process.env.UNIPILE_HOSTED_AUTH_DOMAIN,
};
