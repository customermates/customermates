import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizeBaseUrl,
  resolveAppMode,
  resolveAuthAllowedHosts,
  resolveBaseUrl,
  resolveOptionalBigInt,
  resolveRequestOrigin,
  resolveStrictBoolean,
  resolveVercelBranchOrigin,
} from "@/core/config/environment";

const previewEnvironment = {
  NODE_ENV: "production",
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "preview",
  VERCEL_BRANCH_URL: "customermates-git-feat-inbox-customermates.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "customermates.com",
  VERCEL_URL: "customermates-a1b2c3-customermates.vercel.app",
};

describe("environment configuration", () => {
  it.each(["self-hosted", "cloud", "demo"] as const)("accepts the %s application mode", (mode) => {
    expect(resolveAppMode({ APP_MODE: mode })).toBe(mode);
  });

  it.each([undefined, "", " ", "production", "preview"])("rejects the %s application mode", (mode) => {
    expect(() => resolveAppMode({ APP_MODE: mode })).toThrow(/APP_MODE/);
  });

  it("normalizes configured public URLs to origins", () => {
    expect(normalizeBaseUrl("https://crm.example.com/")).toBe("https://crm.example.com");
    expect(() => normalizeBaseUrl("https://crm.example.com/path")).toThrow("must be an origin");
    expect(() => normalizeBaseUrl("ftp://crm.example.com")).toThrow("must use http or https");
  });

  it("uses localhost only for local development or a self-hosted image build", () => {
    expect(resolveBaseUrl({ NODE_ENV: "development" })).toBe("http://localhost:4000");
    expect(resolveBaseUrl({ NODE_ENV: "production", APP_MODE: "self-hosted" })).toBe("http://localhost:4000");
    expect(() => resolveBaseUrl({ NODE_ENV: "production" })).toThrow("must be configured in production");
    expect(() => resolveBaseUrl({ VERCEL: "1", VERCEL_ENV: "development" })).toThrow(
      "must be configured for this Vercel environment",
    );
  });

  it("keeps explicit Production and Demo origins", () => {
    expect(
      resolveBaseUrl({
        ...previewEnvironment,
        VERCEL_ENV: "production",
        BASE_URL: "https://customermates.com",
      }),
    ).toBe("https://customermates.com");
    expect(
      resolveBaseUrl({
        ...previewEnvironment,
        VERCEL_TARGET_ENV: "demo",
        BASE_URL: "https://demo.customermates.com",
      }),
    ).toBe("https://demo.customermates.com");
    expect(() => resolveBaseUrl({ ...previewEnvironment, VERCEL_TARGET_ENV: "demo" })).toThrow(
      "BASE_URL must be configured for the custom Vercel environment demo",
    );
  });

  it("derives generic Preview from its stable validated branch URL", () => {
    expect(resolveBaseUrl(previewEnvironment)).toBe("https://customermates-git-feat-inbox-customermates.vercel.app");
    expect(resolveVercelBranchOrigin(previewEnvironment)).toBe(
      "https://customermates-git-feat-inbox-customermates.vercel.app",
    );
    expect(
      resolveVercelBranchOrigin({
        ...previewEnvironment,
        VERCEL_ENV: "production",
      }),
    ).toBeUndefined();
    expect(() => resolveBaseUrl({ ...previewEnvironment, VERCEL_BRANCH_URL: undefined })).toThrow(
      "VERCEL_BRANCH_URL must be configured",
    );
    expect(() =>
      resolveBaseUrl({
        ...previewEnvironment,
        VERCEL_BRANCH_URL: "https://example.vercel.app",
      }),
    ).toThrow("must be a hostname without a protocol");
    expect(() =>
      resolveBaseUrl({
        ...previewEnvironment,
        VERCEL_BRANCH_URL: "preview.example.com",
      }),
    ).toThrow("must be a vercel.app hostname");
    expect(() =>
      resolveBaseUrl({
        ...previewEnvironment,
        VERCEL_BRANCH_URL: "example.vercel.app/path",
      }),
    ).toThrow("must be an origin");
  });

  it("allows the Vercel production domain, its vanity subdomains, and project-specific aliases", () => {
    const baseUrl = resolveBaseUrl(previewEnvironment);
    const allowedHosts = resolveAuthAllowedHosts(previewEnvironment, baseUrl);

    expect(allowedHosts).toEqual(
      expect.arrayContaining([
        "customermates.com",
        "*.customermates.com",
        "customermates-git-feat-inbox-customermates.vercel.app",
        "customermates-a1b2c3-customermates.vercel.app",
      ]),
    );
    expect(allowedHosts).not.toContain("*.vercel.app");
  });

  it("keeps live-data credentials ephemeral and restores fail-closed", () => {
    const template = readFileSync(new URL("../../.env.cloud.template", import.meta.url), "utf8");
    const useLiveData = readFileSync(new URL("../../scripts/use-live-data.sh", import.meta.url), "utf8");

    expect(template).not.toContain("DATABASE_URL_PROD");
    expect(template).not.toContain("DATABASE_DIRECT_URL_PROD");
    expect(useLiveData).not.toContain("DATABASE_URL_PROD");
    expect(useLiveData).not.toContain("DATABASE_DIRECT_URL_PROD");
    expect(useLiveData).toContain('read -r -s -p "Paste the Production direct database URL (input hidden): "');
    expect(useLiveData).toContain("SHOW server_version_num");
    expect(useLiveData).toContain("PostgreSQL client preflight failed");
    expect(useLiveData).toContain("PGOPTIONS='-c default_transaction_read_only=on' pg_dump \"$production_url\"");
    expect(useLiveData).toContain('pg_restore --list "$archive"');
    expect(useLiveData).toContain("dropdb --if-exists --force");
    expect(useLiveData.indexOf("SHOW server_version_num")).toBeLessThan(
      useLiveData.indexOf("PGOPTIONS='-c default_transaction_read_only=on' pg_dump"),
    );
    expect(useLiveData.indexOf("PostgreSQL client preflight failed")).toBeLessThan(
      useLiveData.indexOf("dropdb --if-exists --force"),
    );
    expect(useLiveData.indexOf('pg_restore --list "$archive"')).toBeLessThan(
      useLiveData.indexOf("dropdb --if-exists --force"),
    );
    expect(useLiveData).toContain("--exit-on-error");
    expect(useLiveData).toContain('SET "enabled" = false');
    expect(useLiveData).not.toContain("dumps/");
  });

  it("preserves validated request and vanity origins in redirects", () => {
    const fallback = "https://customermates-git-feat-inbox-customermates.vercel.app";
    const allowedHosts = [
      "customermates-git-feat-inbox-customermates.vercel.app",
      "*.customermates.com",
      "customermates-a1b2c3-customermates.vercel.app",
    ];

    expect(resolveRequestOrigin("https://feat-inbox.customermates.com/en/dashboard", allowedHosts, fallback)).toBe(
      "https://feat-inbox.customermates.com",
    );
    expect(
      resolveRequestOrigin(
        "https://customermates-a1b2c3-customermates.vercel.app/en/dashboard",
        allowedHosts,
        fallback,
      ),
    ).toBe("https://customermates-a1b2c3-customermates.vercel.app");
    expect(resolveRequestOrigin("https://attacker.example/en/dashboard", allowedHosts, fallback)).toBe(fallback);
    expect(resolveRequestOrigin("http://feat-inbox.customermates.com/en/dashboard", allowedHosts, fallback)).toBe(
      fallback,
    );
  });

  it("allows only Production and its branch domains to frame Demo builds", () => {
    const config = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");
    expect(config).toContain('env.APP_MODE === "demo"');
    expect(config).toContain(`? "frame-ancestors 'self' https://customermates.com https://*.customermates.com"`);
    expect(config).toContain(`: "frame-ancestors 'self'"`);
    expect(config).not.toContain("test.customermates.com");
    expect(config).not.toContain("frame-ancestors *");
    expect(config).not.toContain("*.vercel.app");
  });

  it("uses the Better Auth host allowlist and dedicated OAuth proxy secret", () => {
    const authConfig = readFileSync(new URL("../../core/auth/better-auth.ts", import.meta.url), "utf8");
    const invitationRoute = readFileSync(
      new URL("../../app/[locale]/(public)/invitation/[token]/route.ts", import.meta.url),
      "utf8",
    );

    expect(authConfig).toContain("allowedHosts: env.AUTH_ALLOWED_HOSTS");
    expect(authConfig).toContain("fallback: env.BASE_URL");
    expect(authConfig).toContain(
      'const baseUrlProtocol = new URL(env.BASE_URL).protocol === "https:" ? "https" : "http"',
    );
    expect(authConfig).toContain("protocol: baseUrlProtocol");
    expect(authConfig).toContain('useSecureCookies: baseUrlProtocol === "https"');
    expect(authConfig).not.toContain('protocol: "auto"');
    expect(authConfig).not.toContain("AUTH_USE_SECURE_COOKIES");
    expect(invitationRoute).toContain("resolveRequestOrigin(request.url, env.AUTH_ALLOWED_HOSTS, env.BASE_URL)");
    expect(invitationRoute).toContain("issueInvitationOnboardingIntent");
    expect(invitationRoute).toContain("response.cookies.delete(INVITE_TOKEN_COOKIE_NAME)");
    expect(authConfig).toContain("productionURL: env.OAUTH_PROXY_URL");
    expect(authConfig).toContain("secret: env.OAUTH_PROXY_SECRET");
    expect(authConfig).not.toContain("currentURL:");
    expect(authConfig).not.toContain("*.vercel.app");
  });
});

const sentryInit = vi.hoisted(() => vi.fn());

vi.mock("@sentry/nextjs", () => ({
  captureRouterTransitionStart: vi.fn(),
  init: sentryInit,
}));
vi.mock("@/env", () => {
  throw new Error("client instrumentation imported the server environment");
});

describe("client instrumentation", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not evaluate server-only application configuration", async () => {
    vi.stubEnv("APP_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");

    await expect(import("@/instrumentation-client")).resolves.toMatchObject({
      onRouterTransitionStart: undefined,
    });
  });

  it("keeps browser transport interruptions and genuine client defects unless an owning boundary handles them", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/1");
    vi.stubEnv("NODE_ENV", "production");

    await import("@/instrumentation-client");

    const options = sentryInit.mock.calls.at(-1)?.[0] as {
      beforeSend?: (event: object, hint: { originalException?: unknown }) => object | null;
    };
    const event = { event_id: "event" };

    expect(options.beforeSend?.(event, { originalException: new TypeError("Failed to fetch") })).toBe(event);
    expect(
      options.beforeSend?.(event, { originalException: new TypeError("Cannot read properties of undefined") }),
    ).toBe(event);
  });
});

describe("hosted-AI control configuration", () => {
  it("reads an unset monthly spend cap as no cap, which refuses hosted-AI spend rather than permitting it", () => {
    for (const absent of [undefined, "", "   "])
      expect(resolveOptionalBigInt("HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS", absent)).toBeNull();

    expect(resolveOptionalBigInt("HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS", "0")).toBe(0n);
    expect(resolveOptionalBigInt("HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS", " 50000000 ")).toBe(50_000_000n);
  });

  it("refuses a spend cap that is not a whole number of microcents instead of coercing it", () => {
    for (const invalid of ["-1", "1.5", "1e6", "50_000", "fifty"])
      expect(() => resolveOptionalBigInt("HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS", invalid)).toThrow(
        /whole number of microcents/,
      );
  });

  it("treats an unset provider pause as not paused and rejects anything but the two literals", () => {
    for (const absent of [undefined, "", "   "])
      expect(resolveStrictBoolean("HOSTED_AI_PROVIDER_WORK_PAUSED", absent)).toBe(false);

    expect(resolveStrictBoolean("HOSTED_AI_PROVIDER_WORK_PAUSED", "true")).toBe(true);
    expect(resolveStrictBoolean("HOSTED_AI_PROVIDER_WORK_PAUSED", "false")).toBe(false);

    for (const invalid of ["TRUE", "1", "yes", "on"])
      expect(() => resolveStrictBoolean("HOSTED_AI_PROVIDER_WORK_PAUSED", invalid)).toThrow(/"true" or "false"/);
  });
});
