import { afterEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({ APP_MODE: "self-hosted" as "cloud" | "self-hosted" }));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve((key: string) => key),
}));

import { AgplGithubBadge } from "../agpl-github-badge";

describe("AgplGithubBadge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not call the GitHub API from a self-hosted instance", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await AgplGithubBadge({});

    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the star count on cloud", async () => {
    mockEnv.APP_MODE = "cloud";
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ stargazers_count: 42 }) });
    vi.stubGlobal("fetch", fetch);

    await AgplGithubBadge({});

    expect(fetch).toHaveBeenCalledWith("https://api.github.com/repos/customermates/customermates", expect.anything());
  });
});
