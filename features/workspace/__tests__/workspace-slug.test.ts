import { describe, expect, it } from "vitest";

import {
  claimWorkspaceSlug,
  isValidWorkspaceSlug,
  slugifyWorkspaceName,
  workspaceSlugCandidate,
  WorkspaceSlugSchema,
} from "../workspace-slug";

describe("slugifyWorkspaceName", () => {
  it.each([
    ["Müller & Söhne GmbH", "mueller-and-soehne-gmbh"],
    ["ÄÖÜ Großhandel", "aeoeue-grosshandel"],
    ["Crème Brûlée Café", "creme-brulee-cafe"],
    ["  --Acme -- Corp--  ", "acme-corp"],
    ["2026", "2026"],
    ["Łódź Søndergaard", "lodz-sondergaard"],
  ])("turns %s into %s", (name, slug) => {
    expect(slugifyWorkspaceName(name)).toBe(slug);
  });

  it("falls back to a generic slug for empty or unsupported names", () => {
    expect(slugifyWorkspaceName(null)).toBe("workspace");
    expect(slugifyWorkspaceName("   ")).toBe("workspace");
    expect(slugifyWorkspaceName("日本語")).toBe("workspace");
  });

  it("moves reserved words out of the routing namespace", () => {
    expect(slugifyWorkspaceName("Dashboard")).toBe("dashboard-workspace");
    expect(slugifyWorkspaceName("W")).toBe("w-workspace");
  });

  it("caps slugs at 40 characters without a trailing separator", () => {
    const slug = slugifyWorkspaceName("A very long workspace name that certainly exceeds the forty character cap");
    expect(slug).toBe("a-very-long-workspace-name-that-certainl");
    expect(slugifyWorkspaceName(`${"a".repeat(39)} b`)).toBe("a".repeat(39));
  });
});

describe("workspace slug validation", () => {
  it("accepts lowercase kebab slugs and refuses reserved or malformed ones", () => {
    expect(isValidWorkspaceSlug("small-business")).toBe(true);
    expect(isValidWorkspaceSlug("settings")).toBe(false);
    expect(isValidWorkspaceSlug("Small")).toBe(false);
    expect(isValidWorkspaceSlug("a--b")).toBe(false);
    expect(isValidWorkspaceSlug("-a")).toBe(false);
    expect(isValidWorkspaceSlug("a".repeat(41))).toBe(false);
  });

  it("normalizes input before validating", () => {
    expect(WorkspaceSlugSchema.parse("  Small-Business ")).toBe("small-business");
    expect(WorkspaceSlugSchema.safeParse("admin").success).toBe(false);
  });
});

describe("claimWorkspaceSlug", () => {
  it("numbers colliding names and keeps the 40 character cap", async () => {
    const taken = new Set(["acme", "acme-2"]);
    await expect(claimWorkspaceSlug("Acme", (slug) => Promise.resolve(!taken.has(slug)))).resolves.toBe("acme-3");

    const long = "x".repeat(40);
    expect(workspaceSlugCandidate(long, 1)).toBe(`${"x".repeat(38)}-2`);
  });

  it("gives unnamed workspaces a random suffix instead of a guessable number", async () => {
    const slug = await claimWorkspaceSlug(null, () => Promise.resolve(true));
    expect(slug).toMatch(/^workspace-[a-f0-9]{6}$/u);
  });

  it("switches to random suffixes after many collisions and gives up eventually", async () => {
    const tried: string[] = [];
    await expect(
      claimWorkspaceSlug("Acme", (slug) => {
        tried.push(slug);
        return Promise.resolve(false);
      }),
    ).rejects.toThrow();
    expect(tried[19]).toBe("acme-20");
    expect(tried[20]).toMatch(/^acme-[a-f0-9]{6}$/u);
  });
});
