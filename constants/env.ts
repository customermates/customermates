export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";
export const IS_DEMO_MODE = process.env.DEMO_MODE === "true";
export const IS_CLOUD_HOSTED = process.env.CLOUD_HOSTED === "true";
export const IS_CLOUD_BUILD = process.env.VERCEL === "1";
export const BASE_URL = process.env.BASE_URL || "http://localhost:4000";
export const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "mail@customermates.com";

function getAgentBaseUrl(): string {
  const baseUrl = new URL(BASE_URL);
  const isLocal = baseUrl.hostname === "localhost";
  const isCloudflare = baseUrl.hostname.endsWith(".trycloudflare.com");

  if (isLocal || isCloudflare) return `https://${process.env.FLY_APP_NAME ?? ""}.fly.dev`;

  baseUrl.hostname = `agents.${baseUrl.hostname}`;
  return baseUrl.origin;
}

export const AGENT_BASE_URL = getAgentBaseUrl();
