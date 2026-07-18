import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requiredEnvironment = {
  APP_MODE: "self-hosted",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5433/customermates",
};

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("OAuth proxy environment", () => {
  it("accepts the proxy URL and dedicated secret together", async () => {
    vi.stubEnv("APP_MODE", requiredEnvironment.APP_MODE);
    vi.stubEnv("DATABASE_URL", requiredEnvironment.DATABASE_URL);
    vi.stubEnv("OAUTH_PROXY_URL", "https://customermates.com/");
    vi.stubEnv("OAUTH_PROXY_SECRET", "shared-proxy-secret");

    const { env } = await import("@/env");

    expect(env.OAUTH_PROXY_URL).toBe("https://customermates.com");
    expect(env.OAUTH_PROXY_SECRET).toBe("shared-proxy-secret");
  });

  it.each([
    { secret: "", url: "https://customermates.com" },
    { secret: "shared-proxy-secret", url: "" },
  ])("rejects a partial proxy configuration", async ({ secret, url }) => {
    vi.stubEnv("APP_MODE", requiredEnvironment.APP_MODE);
    vi.stubEnv("DATABASE_URL", requiredEnvironment.DATABASE_URL);
    vi.stubEnv("OAUTH_PROXY_URL", url);
    vi.stubEnv("OAUTH_PROXY_SECRET", secret);

    await expect(import("@/env")).rejects.toThrow(
      "OAUTH_PROXY_URL and OAUTH_PROXY_SECRET must be configured together",
    );
  });
});
