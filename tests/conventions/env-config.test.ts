import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { normalizeBaseUrl, resolveAppMode, resolveBaseUrl, resolveVercelBranchOrigin } from "@/core/config/environment";
import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";

describe("environment configuration", () => {
  it("normalizes BASE_URL to an origin", () => {
    expect(normalizeBaseUrl("https://crm.example.com/")).toBe("https://crm.example.com");
    expect(() => normalizeBaseUrl("https://crm.example.com/path")).toThrow("must be an origin");
  });

  it("deploys main through Vercel-managed environments", () => {
    const root = new URL("../../", import.meta.url);
    const ciWorkflow = readFileSync(new URL(".github/workflows/test.yml", root), "utf8");
    const vercelConfig = JSON.parse(readFileSync(new URL("vercel.json", root), "utf8")) as {
      git?: { deploymentEnabled?: boolean | Record<string, boolean> };
    };

    expect(ciWorkflow).not.toContain("develop");
    expect(ciWorkflow).toMatch(/push:\n\s+branches: \[main\]/);
    expect(ciWorkflow).toMatch(/pull_request:\n\s+branches: \[main\]/);
    expect(vercelConfig.git?.deploymentEnabled).toBe(true);
  });

  it("requires an explicit BASE_URL in production but defaults locally", () => {
    expect(resolveBaseUrl({ NODE_ENV: "development" })).toBe("http://localhost:4000");
    expect(() => resolveBaseUrl({ NODE_ENV: "production" })).toThrow("must be configured in production");
    expect(
      resolveBaseUrl({
        NODE_ENV: "production",
        BASE_URL: "https://crm.example.com",
      }),
    ).toBe("https://crm.example.com");
  });

  it("uses the Vercel branch origin only for the default Preview target", () => {
    const defaultPreview = {
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_BRANCH_URL: "customermates-git-feature.example.vercel.app",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "feature/example",
    };

    expect(resolveBaseUrl(defaultPreview)).toBe("https://customermates-git-feature.example.vercel.app");
    expect(resolveVercelBranchOrigin(defaultPreview)).toBe("https://customermates-git-feature.example.vercel.app");
    expect(resolveVercelBranchOrigin({ VERCEL_BRANCH_URL: defaultPreview.VERCEL_BRANCH_URL })).toBeUndefined();
    expect(resolveVercelBranchOrigin({ ...defaultPreview, VERCEL_ENV: "production" })).toBeUndefined();
    expect(
      resolveBaseUrl({
        ...defaultPreview,
        PREVIEW_DOMAIN: "customermates.com",
        VERCEL_GIT_COMMIT_REF: "feat/add-inbox",
      }),
    ).toBe("https://feat-add-inbox.customermates.com");
    expect(
      resolveBaseUrl({
        ...defaultPreview,
        PREVIEW_DOMAIN: "customermates.com",
        VERCEL_GIT_COMMIT_REF: "sandbox/rewe",
      }),
    ).toBe("https://rewe.customermates.com");
    expect(
      resolveBaseUrl({
        ...defaultPreview,
        PREVIEW_DOMAIN: "customermates.com",
        VERCEL_GIT_COMMIT_REF: "feat/demo",
      }),
    ).toBe("https://feat-demo.customermates.com");
    expect(
      resolveBaseUrl({
        ...defaultPreview,
        BASE_URL: "https://explicit.example.com/",
      }),
    ).toBe("https://explicit.example.com");
    expect(() =>
      resolveBaseUrl({
        ...defaultPreview,
        VERCEL_BRANCH_URL: "example.vercel.app/path",
      }),
    ).toThrow("must be an origin");
    expect(() => resolveBaseUrl({ ...defaultPreview, VERCEL_BRANCH_URL: undefined })).toThrow(
      "VERCEL_BRANCH_URL must be configured",
    );
  });

  it("uses an explicit URL for the custom demo environment", () => {
    const vercelEnvironment = {
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_BRANCH_URL: "customermates-git-feature.example.vercel.app",
      VERCEL_ENV: "preview",
      VERCEL_TARGET_ENV: "demo",
    };

    expect(
      resolveBaseUrl({
        ...vercelEnvironment,
        VERCEL_GIT_COMMIT_REF: "main",
      }),
    ).toBe("https://customermates-git-feature.example.vercel.app");
    expect(
      resolveBaseUrl({
        ...vercelEnvironment,
        BASE_URL: "https://demo.customermates.com",
        VERCEL_GIT_COMMIT_REF: "main",
      }),
    ).toBe("https://demo.customermates.com");
    expect(() =>
      resolveBaseUrl({
        ...vercelEnvironment,
        VERCEL_ENV: "production",
      }),
    ).toThrow("BASE_URL must be configured");
  });

  it("accepts only the three application modes", () => {
    expect(() => resolveAppMode({})).toThrow("APP_MODE must be configured");
    expect(() => resolveAppMode({ APP_MODE: " " })).toThrow("APP_MODE must be configured");
    expect(resolveAppMode({ APP_MODE: "self-hosted" })).toBe("self-hosted");
    expect(resolveAppMode({ APP_MODE: "cloud" })).toBe("cloud");
    expect(resolveAppMode({ APP_MODE: "demo" })).toBe("demo");
    expect(() => resolveAppMode({ APP_MODE: "hosted" })).toThrow("APP_MODE must be self-hosted, cloud, or demo");
  });

  it("owns one public synthetic fixture login in code", () => {
    expect(SYNTHETIC_SEED_USER).toEqual({
      email: "max.bergmann@customermates.com",
      password: "local-demo-password",
    });
  });
});
