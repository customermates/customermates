import { describe, expect, it, vi } from "vitest";

vi.mock("@/core/fumadocs/source", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");

  const sourceFor = (collection: string, nameKey: string) => ({
    getPage: ([slug]: string[], locale: string) =>
      fs.existsSync(path.join(process.cwd(), "content", collection, locale, `${slug}.mdx`))
        ? { data: { description: `${collection}:${slug}`, [nameKey]: `${locale}:${slug}` } }
        : undefined,
    getPages: (locale: string) =>
      fs.existsSync(path.join(process.cwd(), "content", collection, locale))
        ? fs
            .readdirSync(path.join(process.cwd(), "content", collection, locale))
            .filter((file) => file.endsWith(".mdx"))
            .map((file) => file.slice(0, -".mdx".length))
            .map((slug) => ({
              data: { description: `${collection}:${slug}`, [nameKey]: `${locale}:${slug}` },
              url: `/${locale}/x/${slug}`,
            }))
        : [],
  });

  return {
    featurePagesSource: sourceFor("feature-pages", "featureName"),
    forPagesSource: sourceFor("for-pages", "industryName"),
    forSource: {
      getPage: ([slug]: string[], locale: string) =>
        fs.existsSync(path.join(process.cwd(), "content", "for", locale, `${slug}.mdx`))
          ? { data: { cta: {}, hero: { title: "Hub" }, title: "Hub" } }
          : undefined,
    },
  };
});

vi.mock("@/app/components/footer", () => ({ Footer: () => null }));
vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve((key: string) => key) }));
vi.mock("@/core/fumadocs/metadata", () => ({ generateMetadataFromMeta: () => ({}) }));

import { forHubSolutionGroups, renderForHub } from "../for-hub";

import { SOLUTION_CATALOG } from "@/core/solutions/solution-catalog";

const TITLES = { team: "By team", workflow: "By workflow" };

describe("for hub solution groups", () => {
  it("lists team solutions in catalog order, then professional services, and workflows by their feature page", () => {
    const [team, workflow] = forHubSolutionGroups("en", TITLES);

    expect(team.items.map((item) => item.href)).toEqual([
      ...SOLUTION_CATALOG.filter((entry) => entry.group === "team").map((entry) => entry.landingPath),
      "/for/professional-services",
    ]);
    expect(workflow.items.map((item) => item.href)).toEqual(
      SOLUTION_CATALOG.filter((entry) => entry.group === "workflow").map((entry) => entry.landingPath),
    );
    expect(workflow.items.every((item) => item.href.startsWith("/features/"))).toBe(true);
  });

  it("offers a partial marketing locale only the solutions it publishes", () => {
    const [team, workflow] = forHubSolutionGroups("fr", TITLES);

    expect(team.items.map((item) => item.href)).toEqual(["/for/smb", "/for/agencies"]);
    expect(workflow.items.map((item) => item.href)).toEqual(["/features/contact-management", "/features/pipeline"]);
    expect(team.items[0].name).toBe("fr:smb");
  });

  it("paginates a partial locale over its own pages instead of the default locale's", async () => {
    await expect(renderForHub("fr", 1)).resolves.toBeTruthy();
  });
});
