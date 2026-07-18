export type AppMode = "cloud" | "demo" | "self-hosted";
export type Environment = Readonly<Record<string, string | undefined>>;

const LOCAL_BASE_URL = "http://localhost:4000";
const VERCEL_DOMAIN = ".vercel.app";

function isVercelDeployment(source: Environment): boolean {
  return source.VERCEL === "1" || Boolean(source.VERCEL_ENV?.trim());
}

function isDefaultVercelEnvironment(target: string | undefined): boolean {
  return !target || target === "production" || target === "preview" || target === "development";
}

function normalizeVercelHostname(rawValue: string | undefined, variableName: string): string | undefined {
  const value = rawValue?.trim();
  if (!value) return undefined;
  if (value.includes("://")) throw new Error(`${variableName} must be a hostname without a protocol`);

  const origin = normalizeBaseUrl(`https://${value}`, variableName);
  const url = new URL(origin);
  if (url.port || !url.hostname.endsWith(VERCEL_DOMAIN))
    throw new Error(`${variableName} must be a vercel.app hostname without a port`);

  return url.hostname;
}

function addDomain(hosts: Set<string>, rawValue: string | undefined): void {
  const value = rawValue?.trim();
  if (!value) return;

  const origin = normalizeBaseUrl(value.includes("://") ? value : `https://${value}`, "domain");
  const { hostname, port } = new URL(origin);
  hosts.add(port ? `${hostname}:${port}` : hostname);
  if (!port && hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "[::1]") hosts.add(`*.${hostname}`);
}

function matchesHostPattern(host: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^${escaped}$`, "i").test(host);
}

export function resolveAppMode(source: Environment): AppMode {
  const appMode = source.APP_MODE?.trim();
  if (!appMode) throw new Error("APP_MODE must be configured as self-hosted, cloud, or demo");
  if (appMode !== "self-hosted" && appMode !== "cloud" && appMode !== "demo")
    throw new Error("APP_MODE must be self-hosted, cloud, or demo");
  return appMode;
}

export function normalizeBaseUrl(rawValue: string, variableName = "BASE_URL"): string {
  let url: URL;

  try {
    url = new URL(rawValue.trim());
  } catch {
    throw new Error(`${variableName} must be a valid absolute URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`${variableName} must use http or https`);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error(`${variableName} must be an origin without credentials, a path, query parameters, or a fragment`);

  return url.origin;
}

export function shouldUseSecureCookies(baseUrl: string): boolean {
  return new URL(normalizeBaseUrl(baseUrl)).protocol === "https:";
}

export function resolveVercelBranchOrigin(source: Environment): string | undefined {
  if (!isVercelDeployment(source) || source.VERCEL_ENV !== "preview") return undefined;
  const hostname = normalizeVercelHostname(source.VERCEL_BRANCH_URL, "VERCEL_BRANCH_URL");
  return hostname ? `https://${hostname}` : undefined;
}

export function resolveBaseUrl(source: Environment): string {
  const configuredBaseUrl = source.BASE_URL?.trim();
  if (configuredBaseUrl) return normalizeBaseUrl(configuredBaseUrl);

  if (isVercelDeployment(source)) {
    const target = source.VERCEL_TARGET_ENV?.trim();
    if (!isDefaultVercelEnvironment(target))
      throw new Error(`BASE_URL must be configured for the custom Vercel environment ${target}`);

    const branchOrigin = resolveVercelBranchOrigin(source);
    if (branchOrigin) return branchOrigin;

    if (source.VERCEL_ENV === "preview")
      throw new Error("VERCEL_BRANCH_URL must be configured when BASE_URL is omitted in Preview");

    throw new Error("BASE_URL must be configured for this Vercel environment");
  }

  if (source.NODE_ENV === "production" && source.APP_MODE !== "self-hosted")
    throw new Error("BASE_URL must be configured in production");
  return LOCAL_BASE_URL;
}

export function resolveAuthAllowedHosts(source: Environment, baseUrl: string): string[] {
  const hosts = new Set<string>([new URL(baseUrl).host]);

  addDomain(hosts, source.OAUTH_PROXY_URL);

  if (isVercelDeployment(source)) {
    addDomain(hosts, source.VERCEL_PROJECT_PRODUCTION_URL);
    const branchHostname = normalizeVercelHostname(source.VERCEL_BRANCH_URL, "VERCEL_BRANCH_URL");
    const deploymentHostname = normalizeVercelHostname(source.VERCEL_URL, "VERCEL_URL");

    if (branchHostname) hosts.add(branchHostname);
    if (deploymentHostname) hosts.add(deploymentHostname);
  }

  return [...hosts];
}

export function resolveRequestOrigin(requestUrl: string, allowedHosts: readonly string[], fallback: string): string {
  const fallbackOrigin = normalizeBaseUrl(fallback);

  try {
    const request = new URL(requestUrl);
    if (request.protocol !== "http:" && request.protocol !== "https:") return fallbackOrigin;
    if (!allowedHosts.some((pattern) => matchesHostPattern(request.host, pattern))) return fallbackOrigin;

    const fallbackProtocol = new URL(fallbackOrigin).protocol;
    const isLoopback =
      request.hostname === "localhost" || request.hostname === "127.0.0.1" || request.hostname === "[::1]";
    if (!isLoopback && request.protocol !== fallbackProtocol) return fallbackOrigin;

    return request.origin;
  } catch {
    return fallbackOrigin;
  }
}
