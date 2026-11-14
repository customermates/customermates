import type { TemplatePublicationOptions } from "./template-publication";

import { buildLocalePath } from "@/i18n/locale-registry";

import { pagePublicationOptions } from "./template-deployment";
import { getTemplateIndex } from "./template-index";
import { hubVisibility, ownPageSlugs } from "./template-publication";

type TemplatePageData = { description: string; lastModified?: Date; title: string };

type TemplatePage = { data: TemplatePageData; slugs: string[]; url: string };

type TemplatePageLookup = {
  getPage: (path: string[], locale: string) => TemplatePage | undefined;
  getPages: (locale: string) => TemplatePage[];
};

export const TEMPLATES_HUB_PATH = "/templates";

export function templatePagePath(slug: string): string {
  return `${TEMPLATES_HUB_PATH}/${slug}`;
}

function dateOf(value: string): Date | undefined {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function latest(dates: readonly (Date | undefined)[]): Date | undefined {
  return dates.reduce<Date | undefined>(
    (newest, date) => (date && (!newest || date > newest) ? date : newest),
    undefined,
  );
}

export function createTemplatesSources(options: TemplatePublicationOptions = {}) {
  const index = () => options.index ?? getTemplateIndex();

  function detail(slug: string, locale: string): TemplatePage | undefined {
    const entry = index().find((candidate) => candidate.slug === slug);
    const text = entry?.locales[locale];
    if (!entry || !text?.page || !ownPageSlugs(locale, options).includes(slug)) return undefined;
    return {
      data: {
        description: text.page.metaDescription,
        lastModified: dateOf(entry.reviewedAt),
        title: text.page.metaTitle,
      },
      slugs: [slug],
      url: buildLocalePath(locale, templatePagePath(slug)),
    };
  }

  const pages: TemplatePageLookup = {
    getPage: (path, locale) => (path.length === 1 ? detail(path[0], locale) : undefined),
    getPages: (locale) => ownPageSlugs(locale, options).flatMap((slug) => detail(slug, locale) ?? []),
  };

  const hub: TemplatePageLookup = {
    getPage: (_path, locale) => {
      if (hubVisibility(locale, options) !== "indexable") return undefined;
      return {
        data: {
          description: "",
          lastModified: latest(pages.getPages(locale).map((page) => page.data.lastModified)),
          title: "",
        },
        slugs: ["templates"],
        url: buildLocalePath(locale, TEMPLATES_HUB_PATH),
      };
    },
    getPages: (locale) => {
      const page = hub.getPage(["templates"], locale);
      return page ? [page] : [];
    },
  };

  return { hub, pages };
}

export const templatesSources = createTemplatesSources(pagePublicationOptions());

export const templatesHubSource = templatesSources.hub;

export const templatePagesSource = templatesSources.pages;
