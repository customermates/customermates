import type { TemplateIndex, TemplateIndexEntry } from "@/core/templates/template-index.types";
import type { TemplateDeployment } from "@/core/templates/template-publication";
import type { TemplateSlug } from "@/core/templates/template-slugs";

import { getTemplateIndex } from "@/core/templates/template-index";
import { isTemplateOffered } from "@/core/templates/template-publication";
import { isTemplateSlug } from "@/core/templates/template-slugs";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

export type OnboardingTemplateCard = {
  slug: TemplateSlug;
  family: TemplateIndexEntry["family"];
  name: string;
  summary: string;
  counts: { lists: number; views: number; rules: number };
};

type OfferOptions = {
  locale: string;
  deployment: TemplateDeployment;
  index?: TemplateIndex;
};

export function offeredTemplateCards(options: OfferOptions): OnboardingTemplateCard[] {
  return (options.index ?? getTemplateIndex()).flatMap((entry) => {
    const text = entry.locales[options.locale] ?? entry.locales[DEFAULT_LOCALE];
    if (!text || !isTemplateSlug(entry.slug) || !isTemplateOffered(entry, options.deployment)) return [];
    return [
      {
        slug: entry.slug,
        family: entry.family,
        name: text.name,
        summary: text.summary,
        counts: { lists: entry.counts.lists, views: entry.counts.views, rules: entry.counts.rules },
      },
    ];
  });
}
