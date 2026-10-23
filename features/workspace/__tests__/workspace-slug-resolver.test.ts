import { describe, expect, it, vi } from "vitest";

import { WorkspaceSlugResolver } from "../workspace-slug-resolver";
import { workspaceReturnUrl } from "../workspace-return-url";

describe("WorkspaceSlugResolver", () => {
  it("uses the tenant user's slug without a lookup", async () => {
    const repo = { findWorkspaceSlugUnscoped: vi.fn() };
    const resolver = new WorkspaceSlugResolver(repo);
    expect(await resolver.slugOf({ companyId: "c1", company: { slug: "acme" } })).toBe("acme");
    expect(repo.findWorkspaceSlugUnscoped).not.toHaveBeenCalled();
  });

  it("looks a missing slug up once per workspace and call", async () => {
    const repo = { findWorkspaceSlugUnscoped: vi.fn((companyId: string) => Promise.resolve(`ws-${companyId}`)) };
    const resolver = new WorkspaceSlugResolver(repo);
    expect(await resolver.slugOf({ companyId: "c1" })).toBe("ws-c1");
    expect(await resolver.slugFor("c1")).toBe("ws-c1");
    expect(await resolver.requireSlugOf({ companyId: "c2", company: null })).toBe("ws-c2");
    expect(repo.findWorkspaceSlugUnscoped).toHaveBeenCalledTimes(2);
  });

  it("refuses to build links for a workspace without a slug", async () => {
    const resolver = new WorkspaceSlugResolver({ findWorkspaceSlugUnscoped: () => Promise.resolve(null) });
    await expect(resolver.requireSlugOf({ companyId: "gone" })).rejects.toThrow("Workspace slug is missing");
  });
});

describe("workspaceReturnUrl", () => {
  it("returns into the workspace or falls back to the generic entry", () => {
    expect(workspaceReturnUrl("https://app.example/", "acme", "/settings/billing")).toBe(
      "https://app.example/w/acme/settings/billing",
    );
    expect(workspaceReturnUrl("https://app.example", "acme", "/settings/billing", "de")).toBe(
      "https://app.example/de/w/acme/settings/billing",
    );
    expect(workspaceReturnUrl("https://app.example", null, "/settings/billing")).toBe("https://app.example/dashboard");
    expect(workspaceReturnUrl("https://app.example", undefined, "/settings/billing", "de")).toBe(
      "https://app.example/de/dashboard",
    );
  });
});
