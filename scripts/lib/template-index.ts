import type { TemplateIndex, TemplateIndexEntry } from "@/core/templates/template-index.types";
import type { TemplateBundle } from "@/core/templates/template-spec.schema";

function entryOf({ spec, text }: TemplateBundle): TemplateIndexEntry {
  const locales: TemplateIndexEntry["locales"] = {};
  for (const locale of Object.keys(text).sort()) {
    const status = spec.status[locale];
    if (!status) continue;
    const copy = text[locale];
    locales[locale] = {
      name: copy.name,
      summary: copy.summary,
      status,
      publicPage: spec.publicPage[locale] ?? "none",
      page: copy.page ? { metaTitle: copy.page.metaTitle, metaDescription: copy.page.metaDescription } : null,
    };
  }
  return {
    slug: spec.slug,
    family: spec.family,
    kind: spec.kind,
    requiresCapabilities: [...spec.requiresCapabilities],
    pairedPages: { ...spec.pairedPages },
    reviewedAt: spec.reviewedAt,
    counts: {
      lists: spec.lists.length,
      fields: spec.fields.length + spec.stages.length + spec.calculations.length,
      views: spec.views.length,
      widgets: spec.widgets.length,
      rules: spec.followUpRules.length,
    },
    locales,
  };
}

export function buildTemplateIndex(bundles: Map<string, TemplateBundle>): TemplateIndex {
  return [...bundles.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, bundle]) => entryOf(bundle));
}
