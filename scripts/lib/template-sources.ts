import type { TemplateBundle, TemplateModule } from "@/core/templates/template-spec.schema";

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { compileTemplate } from "@/core/templates/compile-template";
import {
  TemplateBundleSchema,
  TemplateLocaleSchema,
  TemplateModuleSchema,
  TemplateModuleTextSchema,
  TemplateSpecObjectSchema,
  TemplateSpecSchema,
} from "@/core/templates/template-spec.schema";
import { templateTextIssues } from "@/core/templates/template-text-validation";

export const TEMPLATES_ROOT = join(process.cwd(), "templates");
export const BUNDLES_ROOT = join(process.cwd(), "core", "templates", "bundles");

const NON_TEMPLATE_DIRECTORIES = new Set(["_modules", "schema"]);
const MODULE_ARRAYS = [
  "lists",
  "fields",
  "stages",
  "calculations",
  "relationships",
  "views",
  "widgets",
  "knowledgePages",
  "followUpRules",
  "acceptanceChecks",
] as const;
const TEXT_SECTIONS = [
  "lists",
  "fields",
  "relationships",
  "views",
  "widgets",
  "knowledgePages",
  "rules",
  "acceptanceChecks",
] as const;

type RawObject = Record<string, unknown>;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown, label: string): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`${label}\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export function templateSlugsOnDisk(root: string = TEMPLATES_ROOT): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !NON_TEMPLATE_DIRECTORIES.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function readTemplateModules(root: string = TEMPLATES_ROOT): Map<string, TemplateModule> {
  const directory = join(root, "_modules");
  const modules = new Map<string, TemplateModule>();
  if (!existsSync(directory)) return modules;
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    const parsed = parseOrThrow(TemplateModuleSchema, readJson(join(directory, file)), `templates/_modules/${file}`);
    if (`${parsed.key}.json`.replace(/_/g, "-") !== file)
      throw new Error(`templates/_modules/${file}: key ${parsed.key} does not match the file name`);
    modules.set(parsed.key, parsed);
  }
  return modules;
}

function moduleFor(modules: Map<string, TemplateModule>, key: string, slug: string): TemplateModule {
  const found = modules.get(key);
  if (!found) throw new Error(`templates/${slug}/template.json: unknown module ${key}`);
  return found;
}

export function resolveTemplateSpec(raw: unknown, modules: Map<string, TemplateModule>, slug: string) {
  const base = parseOrThrow(TemplateSpecObjectSchema, raw, `templates/${slug}/template.json`);
  const merged: RawObject = { ...base };
  for (const key of base.modules) {
    const module = moduleFor(modules, key, slug);
    for (const name of MODULE_ARRAYS) merged[name] = [...(merged[name] as unknown[]), ...module[name]];
  }
  return parseOrThrow(TemplateSpecSchema, merged, `templates/${slug}/template.json (with modules)`);
}

function localeFiles(root: string, slug: string): string[] {
  const directory = join(root, slug, "locales");
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort();
}

function mergedText(raw: unknown, modules: TemplateModule[], locale: string, slug: string): unknown {
  const text = { ...(raw as RawObject) };
  for (const module of modules) {
    const moduleText = parseOrThrow(
      TemplateModuleTextSchema,
      module.text[locale] ?? {},
      `templates/_modules/${module.key}.json text.${locale}`,
    );
    for (const section of TEXT_SECTIONS) {
      text[section] = { ...moduleText[section], ...((text[section] as RawObject | undefined) ?? {}) };
    }
  }
  if (!text.locale) throw new Error(`templates/${slug}/locales/${locale}.json: missing locale`);
  return text;
}

export function buildTemplateBundle(
  slug: string,
  root: string = TEMPLATES_ROOT,
  modules = readTemplateModules(root),
): TemplateBundle {
  const raw = readJson(join(root, slug, "template.json")) as RawObject;
  const spec = resolveTemplateSpec(raw, modules, slug);
  if (spec.slug !== slug)
    throw new Error(`templates/${slug}/template.json: slug ${spec.slug} does not match the folder`);
  const used = spec.modules.map((key) => moduleFor(modules, key, slug));
  const text = Object.fromEntries(
    localeFiles(root, slug).map((locale) => {
      const label = `templates/${slug}/locales/${locale}.json`;
      const parsed = parseOrThrow(
        TemplateLocaleSchema,
        mergedText(readJson(join(root, slug, "locales", `${locale}.json`)), used, locale, slug),
        label,
      );
      const issues = templateTextIssues(spec, parsed, locale);
      if (issues.length) throw new Error(`${label}\n${issues.join("\n")}`);
      compileTemplate(spec, parsed);
      return [locale, parsed];
    }),
  );
  if (Object.keys(text).sort().join() !== Object.keys(spec.status).sort().join())
    throw new Error(`templates/${slug}: locale files and status keys differ`);
  return parseOrThrow(TemplateBundleSchema, { spec, text }, `templates/${slug} bundle`);
}

export function buildTemplateBundles(root: string = TEMPLATES_ROOT): Map<string, TemplateBundle> {
  const modules = readTemplateModules(root);
  return new Map(templateSlugsOnDisk(root).map((slug) => [slug, buildTemplateBundle(slug, root, modules)]));
}
