import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { RECORD_TYPE_ICON_KEYS } from "@/components/records/record-type-icon";
import { TEMPLATE_SLUGS, getTemplate, getTemplateText } from "@/core/templates/template-registry";
import { TemplateBundleSchema, TemplateLocaleSchema } from "@/core/templates/template-spec.schema";
import {
  GENERATED_COMMAND,
  driftedOutputs,
  generatedOutputs,
  staleGeneratedFiles,
} from "@/scripts/lib/template-generated";
import {
  BUNDLES_ROOT,
  TEMPLATES_ROOT,
  buildTemplateBundle,
  buildTemplateBundles,
  readTemplateModules,
  templateSlugsOnDisk,
} from "@/scripts/lib/template-sources";

const REPO = process.cwd();
const scratch: string[] = [];

afterAll(() => {
  for (const path of scratch) rmSync(path, { recursive: true, force: true });
});

function copyTemplates(): string {
  const root = mkdtempSync(join(tmpdir(), "templates-"));
  scratch.push(root);
  cpSync(TEMPLATES_ROOT, root, { recursive: true });
  return root;
}

function editJson(path: string, change: (value: Record<string, unknown>) => void) {
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  change(value);
  writeFileSync(path, JSON.stringify(value));
}

describe("template sources", () => {
  it("has a folder and a registry entry for every slug", () => {
    expect(templateSlugsOnDisk()).toEqual([...TEMPLATE_SLUGS].sort());
    for (const slug of TEMPLATE_SLUGS) expect(existsSync(join(BUNDLES_ROOT, `${slug}.json`))).toBe(true);
  });

  it(`matches the generated files (run ${GENERATED_COMMAND} after editing a template)`, () => {
    const outputs = generatedOutputs();
    expect(driftedOutputs(outputs).map((path) => relative(REPO, path))).toEqual([]);
    expect(staleGeneratedFiles(outputs).map((path) => relative(REPO, path))).toEqual([]);
  });

  it("builds every source into a valid bundle", () => {
    const bundles = buildTemplateBundles();
    expect([...bundles.keys()]).toEqual([...TEMPLATE_SLUGS].sort());
    for (const bundle of bundles.values()) expect(TemplateBundleSchema.safeParse(bundle).success).toBe(true);
  });

  it.each(TEMPLATE_SLUGS)("has a locale file for exactly the locales in the status of %s", (slug) => {
    const spec = getTemplate(slug);
    const bundle = buildTemplateBundles().get(slug);
    expect(Object.keys(bundle?.text ?? {}).sort()).toEqual(Object.keys(spec.status).sort());
    for (const locale of Object.keys(spec.status))
      expect(TemplateLocaleSchema.safeParse(getTemplateText(slug, locale)).success).toBe(true);
  });

  it.each(TEMPLATE_SLUGS)("uses only list icons the product can draw in %s", (slug) => {
    const known = new Set<string>(RECORD_TYPE_ICON_KEYS);
    expect(
      getTemplate(slug)
        .lists.filter((list) => !known.has(list.icon))
        .map((list) => list.icon),
    ).toEqual([]);
  });

  it.each(TEMPLATE_SLUGS)("points %s at pages that exist", (slug) => {
    for (const path of Object.values(getTemplate(slug).pairedPages)) {
      const [, section, page] = path.split("/");
      const folder = section === "for" ? "for-pages" : "feature-pages";
      expect(existsSync(join(REPO, "content", folder, "en", `${page}.mdx`))).toBe(true);
    }
  });

  it.each(TEMPLATE_SLUGS)("records when the sources of %s were checked", (slug) => {
    const spec = getTemplate(slug);
    for (const source of spec.sources) {
      expect(source.url.startsWith("https://")).toBe(true);
      expect(source.checkedOn <= spec.reviewedAt).toBe(true);
    }
  });

  it("reads the shared modules", () => {
    const modules = readTemplateModules();
    expect([...modules.keys()]).toEqual(["actions_core", "actions_dashboard"]);
    const shipped = new Set(TEMPLATE_SLUGS.flatMap((slug) => Object.keys(getTemplate(slug).status)));
    for (const key of modules.keys())
      expect(Object.keys(modules.get(key)?.text ?? {}).sort()).toEqual([...shipped].sort());
  });

  it("rejects a template that names an unknown module", () => {
    const root = copyTemplates();
    editJson(join(root, "client-tracker", "template.json"), (spec) => {
      spec.modules = ["missing_module"];
    });
    expect(() => buildTemplateBundle("client-tracker", root)).toThrow("unknown module missing_module");
  });

  it("rejects a template whose slug differs from its folder", () => {
    const root = copyTemplates();
    editJson(join(root, "client-tracker", "template.json"), (spec) => {
      spec.slug = "client-trackers";
      spec.id = "tpl_client_trackers";
    });
    expect(() => buildTemplateBundle("client-tracker", root)).toThrow("does not match the folder");
  });

  it("rejects a locale file that lacks text for an element of the spec", () => {
    const root = copyTemplates();
    editJson(join(root, "client-tracker", "locales", "en.json"), (text) => {
      text.widgets = {};
    });
    expect(() => buildTemplateBundle("client-tracker", root)).toThrow("widgets.overdue_actions is missing");
  });

  it("rejects a locale file for a locale the app does not have", () => {
    const root = copyTemplates();
    cpSync(join(root, "client-tracker", "locales", "en.json"), join(root, "client-tracker", "locales", "ja.json"));
    editJson(join(root, "client-tracker", "locales", "ja.json"), (text) => {
      text.locale = "ja";
    });
    expect(() => buildTemplateBundle("client-tracker", root)).toThrow();
  });

  it("rejects a module that lacks text for a locale a template ships", () => {
    const root = copyTemplates();
    editJson(join(root, "_modules", "actions-core.json"), (module) => {
      const text = module.text as Record<string, unknown>;
      delete text.de;
    });
    expect(() => buildTemplateBundle("client-tracker", root)).toThrow("is missing");
  });
});
