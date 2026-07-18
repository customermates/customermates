import { resolvePreviewDomain } from "./preview-domain";

export type AppMode = "cloud" | "demo" | "self-hosted";
export type Environment = Readonly<Record<string, string | undefined>>;

export function resolveAppMode(source: Environment): AppMode {
  const appMode = source.APP_MODE?.trim();
  if (!appMode) throw new Error("APP_MODE must be configured as self-hosted, cloud, or demo");
  if (appMode !== "self-hosted" && appMode !== "cloud" && appMode !== "demo")
    throw new Error("APP_MODE must be self-hosted, cloud, or demo");
  return appMode;
}

export function normalizeBaseUrl(rawValue: string | undefined): string {
  const raw = rawValue?.trim() || "http://localhost:4000";
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error("BASE_URL must be a valid absolute URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("BASE_URL must use http or https");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("BASE_URL must be an origin without credentials, a path, query parameters, or a fragment");

  return url.origin;
}

function resolveVercelEnvironment(source: Environment): "preview" | "production" {
  if (source.VERCEL !== "1") throw new Error("This operation requires a Vercel deployment context");

  const vercelEnvironment = source.VERCEL_ENV?.trim();
  if (vercelEnvironment !== "preview" && vercelEnvironment !== "production")
    throw new Error("VERCEL_ENV must be preview or production");

  return vercelEnvironment;
}

export function resolveVercelBranchOrigin(source: Environment): string | undefined {
  if (source.VERCEL !== "1" || source.VERCEL_ENV !== "preview") return undefined;
  const branchUrl = source.VERCEL_BRANCH_URL?.trim();
  return branchUrl ? normalizeBaseUrl(`https://${branchUrl}`) : undefined;
}

export function resolveBaseUrl(source: Environment): string {
  const baseUrl = source.BASE_URL;

  if (baseUrl?.trim()) return normalizeBaseUrl(baseUrl);

  if (source.VERCEL === "1") {
    if (resolveVercelEnvironment(source) === "preview") {
      const previewRootDomain = source.PREVIEW_DOMAIN?.trim();
      if (previewRootDomain) {
        const previewDomain = resolvePreviewDomain(source.VERCEL_GIT_COMMIT_REF, previewRootDomain);
        if (previewDomain) return `https://${previewDomain.hostname}`;
      }

      const branchOrigin = resolveVercelBranchOrigin(source);
      if (!branchOrigin) throw new Error("VERCEL_BRANCH_URL must be configured when BASE_URL is omitted in Preview");
      return branchOrigin;
    }

    throw new Error("BASE_URL must be configured for this Vercel environment");
  }

  if (source.NODE_ENV === "production") throw new Error("BASE_URL must be configured in production");

  return normalizeBaseUrl(undefined);
}

export function parseOriginList(rawValue: string | undefined): string[] {
  if (!rawValue?.trim()) return [];

  return [
    ...new Set(
      rawValue
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => normalizeBaseUrl(value)),
    ),
  ];
}
