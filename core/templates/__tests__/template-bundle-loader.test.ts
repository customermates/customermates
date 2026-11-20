import { describe, expect, it } from "vitest";

import { TEMPLATE_BUNDLES_DIRECTORY, loadTemplateBundle } from "@/core/templates/template-bundle-loader";
import { TEMPLATE_SLUGS } from "@/core/templates/template-slugs";

describe("template bundle loader", () => {
  it("loads the bundle of each slug from the bundles directory", async () => {
    expect(TEMPLATE_BUNDLES_DIRECTORY).toBe("core/templates/bundles");
    for (const slug of TEMPLATE_SLUGS) {
      const bundle = await loadTemplateBundle(slug);
      expect(bundle?.spec.slug, slug).toBe(slug);
      expect(Object.keys(bundle?.text ?? {}), slug).toContain("en");
    }
  });

  it("refuses a slug that is not a template, whatever path it spells", async () => {
    expect(await loadTemplateBundle("nope")).toBeNull();
    expect(await loadTemplateBundle("index")).toBeNull();
    expect(await loadTemplateBundle("../template-registry")).toBeNull();
    expect(await loadTemplateBundle("")).toBeNull();
  });

  it("returns the same parsed bundle for every caller", async () => {
    expect(await loadTemplateBundle("sales-pipeline")).toBe(await loadTemplateBundle("sales-pipeline"));
  });
});
