import type { TemplateIndex, TemplateIndexEntry } from "@/core/templates/template-index.types";
import type { TemplateDeployment } from "@/core/templates/template-publication";
import type { TemplateSlug } from "@/core/templates/template-slugs";

import { getTemplateIndex } from "@/core/templates/template-index";
import { isTemplateOffered } from "@/core/templates/template-publication";
import { isTemplateSlug } from "@/core/templates/template-slugs";
import { DEFAULT_LOCALE, routingLocaleFromPathname, stripLocalePrefix } from "@/i18n/locale-registry";

export type OnboardingTemplateCard = {
  slug: TemplateSlug;
  family: TemplateIndexEntry["family"];
  name: string;
  summary: string;
  counts: { lists: number; views: number; rules: number };
};

export type OnboardingTemplatePreselection = {
  slug: TemplateSlug | null;
  reason: "signup" | "page" | "default" | null;
};

type OfferOptions = {
  locale: string;
  deployment: TemplateDeployment;
  index?: TemplateIndex;
};

export const DEFAULT_ONBOARDING_TEMPLATE: TemplateSlug = "sales-pipeline";

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

function templatePairedWithLandingPath(
  cards: readonly OnboardingTemplateCard[],
  landingPath: string | null,
  index: TemplateIndex,
): TemplateSlug | null {
  if (!landingPath) return null;
  const landingLocale = routingLocaleFromPathname(landingPath) ?? DEFAULT_LOCALE;
  const path = stripLocalePrefix(landingPath);
  const offered = new Set(cards.map((card) => card.slug));
  const match = index.find(
    (entry) => offered.has(entry.slug as TemplateSlug) && entry.pairedPages[landingLocale] === path,
  );
  return match && isTemplateSlug(match.slug) ? match.slug : null;
}

export function preselectOnboardingTemplate(args: {
  cards: readonly OnboardingTemplateCard[];
  signupTemplate: string | null;
  landingPath: string | null;
  index?: TemplateIndex;
}): OnboardingTemplatePreselection {
  const offered = new Set<string>(args.cards.map((card) => card.slug));
  if (args.signupTemplate && offered.has(args.signupTemplate) && isTemplateSlug(args.signupTemplate))
    return { slug: args.signupTemplate, reason: "signup" };

  const paired = templatePairedWithLandingPath(args.cards, args.landingPath, args.index ?? getTemplateIndex());
  if (paired) return { slug: paired, reason: "page" };

  if (offered.has(DEFAULT_ONBOARDING_TEMPLATE)) return { slug: DEFAULT_ONBOARDING_TEMPLATE, reason: "default" };
  const first = args.cards[0];
  return first ? { slug: first.slug, reason: "default" } : { slug: null, reason: null };
}
