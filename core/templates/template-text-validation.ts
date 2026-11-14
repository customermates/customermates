import type { TemplateLocale, TemplateSpec } from "./template-spec.schema";

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

function sameKeys(label: string, expected: readonly string[], actual: Readonly<Record<string, unknown>>): string[] {
  const have = new Set(Object.keys(actual));
  const want = new Set(expected);
  return [
    ...expected.filter((key) => !have.has(key)).map((key) => `${label}.${key} is missing`),
    ...Object.keys(actual)
      .filter((key) => !want.has(key))
      .map((key) => `${label}.${key} is not in the spec`),
  ];
}

function optionIssues(spec: TemplateSpec, text: TemplateLocale): string[] {
  const selects = [
    ...spec.fields
      .filter((field) => field.type === "select")
      .map((field) => [field.key, field.options.map((option) => option.key)] as const),
    ...spec.stages.map((stage) => [stage.field, stage.items.map((item) => item.key)] as const),
  ];
  return selects.flatMap(([ref, keys]) => sameKeys(`fields.${ref}.options`, keys, text.fields[ref]?.options ?? {}));
}

function rangeIssues(spec: TemplateSpec, text: TemplateLocale): string[] {
  return spec.fields
    .filter((field) => field.type === "dateRange" && !text.fields[field.key]?.rangeLabels)
    .map((field) => `fields.${field.key}.rangeLabels is missing`);
}

function dashIssues(value: unknown, path: string): string[] {
  if (typeof value === "string") return DASHES.test(value) ? [`${path} contains a dash character`] : [];
  if (Array.isArray(value)) return value.flatMap((item, index) => dashIssues(item, `${path}.${index}`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) => dashIssues(item, `${path}.${key}`));
  return [];
}

export function templateTextIssues(spec: TemplateSpec, text: TemplateLocale, locale: string): string[] {
  const fieldRefs = [
    ...spec.fields.map((field) => field.key),
    ...spec.stages.map((stage) => stage.field),
    ...spec.calculations.map((calculation) => calculation.key),
  ];
  return [
    ...(text.locale === locale ? [] : [`locale is ${text.locale} but the file is ${locale}`]),
    ...(spec.status[locale] ? [] : [`status.${locale} is missing in the spec`]),
    ...sameKeys(
      "lists",
      spec.lists.map((list) => list.key),
      text.lists,
    ),
    ...sameKeys("fields", fieldRefs, text.fields),
    ...optionIssues(spec, text),
    ...rangeIssues(spec, text),
    ...sameKeys(
      "relationships",
      spec.relationships.map((relation) => relation.key),
      text.relationships,
    ),
    ...sameKeys(
      "views",
      spec.views.map((view) => view.key),
      text.views,
    ),
    ...sameKeys(
      "widgets",
      spec.widgets.map((widget) => widget.key),
      text.widgets,
    ),
    ...sameKeys(
      "knowledgePages",
      spec.knowledgePages.map((page) => page.key),
      text.knowledgePages,
    ),
    ...sameKeys(
      "rules",
      spec.followUpRules.map((rule) => rule.key),
      text.rules,
    ),
    ...spec.followUpRules.flatMap((rule) =>
      sameKeys(`rules.${rule.key}.variants`, Object.keys(rule.variants ?? {}), text.rules[rule.key]?.variants ?? {}),
    ),
    ...sameKeys(
      "acceptanceChecks",
      spec.acceptanceChecks.map((check) => check.key),
      text.acceptanceChecks,
    ),
    ...dashIssues(text, locale),
  ];
}
