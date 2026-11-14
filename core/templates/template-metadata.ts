import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { env } from "@/env";
import { buildAlternateLanguages } from "@/core/seo/alternates";
import { buildPageMetadata } from "@/core/seo/page-metadata";
import { MARKETING_LOCALES } from "@/i18n/locale-registry";

import { pagePublicationOptions } from "./template-deployment";
import {
  type TemplatePublicationOptions,
  hubVisibility,
  indexableLocales,
  templateVisibilityBySlug,
} from "./template-publication";
import { TEMPLATES_HUB_PATH, templatePagePath } from "./templates-source";

export type TemplatesHubCopy = { description: string; title: string };

export function generateTemplatesHubMetadata(
  locale: string,
  copy: TemplatesHubCopy,
  options: TemplatePublicationOptions = pagePublicationOptions(),
): Metadata {
  const visibility = hubVisibility(locale, options);
  if (visibility === "hidden") notFound();

  const languages = buildAlternateLanguages(
    TEMPLATES_HUB_PATH,
    MARKETING_LOCALES.filter((candidate) => hubVisibility(candidate, options) === "indexable"),
    env.BASE_URL,
  );

  return buildPageMetadata({
    description: copy.description,
    languages,
    locale,
    noindex: visibility === "noindex",
    publicPath: TEMPLATES_HUB_PATH,
    title: copy.title,
  });
}

export function generateTemplatePageMetadata(
  locale: string,
  slug: string,
  options: TemplatePublicationOptions = pagePublicationOptions(),
): Metadata {
  const found = templateVisibilityBySlug(slug, locale, options);
  const page = found?.locale.page;
  if (!found || !page || (found.visibility !== "own" && found.visibility !== "proof")) notFound();

  const publicPath = templatePagePath(slug);
  const languages = buildAlternateLanguages(
    publicPath,
    indexableLocales(slug, MARKETING_LOCALES, options),
    env.BASE_URL,
  );

  return buildPageMetadata({
    description: page.metaDescription,
    languages,
    locale,
    noindex: found.visibility === "proof",
    publicPath,
    title: page.metaTitle,
  });
}
