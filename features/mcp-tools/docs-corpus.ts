import type { DocsSection } from "./docs-sections";

import { createHash } from "node:crypto";

import {
  retrievalEmbeddingText,
  retrievalSectionLabel,
  retrievalSectionParts,
} from "@/core/retrieval/retrieval-sections";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";
import { DOCS_EMBEDDING_FORMAT, docsEmbeddingBody, docsEmbeddingText } from "./docs-embedding-input";

import { docsCorpusSections, type DocsLocale, type DocsSource } from "./docs-manifest";

const DOCS_CORPUS_SCHEMA = "docs-sections-v1";
export const DOCS_CORPUS_SOURCES: readonly DocsSource[] = ["docs", "api"];

export type DocsSectionPart = {
  locale: DocsLocale;
  source: DocsSource;
  slug: string;
  sectionOrder: number;
  partOrdinal: number;
  anchor: string;
  pageTitle: string;
  headingPath: string[];
  label: string;
  text: string;
  embeddingBody: string;
  contentHash: string;
};

export type DocsCorpus = {
  buildHash: string;
  parts: DocsSectionPart[];
  sections: Map<string, DocsSection>;
  sectionParts: Map<string, DocsSectionPart[]>;
};

let corpus: DocsCorpus | undefined;

export function docsSectionKey(section: { source: string; slug: string; order: number }): string {
  return `${section.source}:${section.slug}:${section.order}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function docsSectionLabel(section: DocsSection): string {
  return retrievalSectionLabel(section.pageTitle, section.headingPath);
}

export function docsSectionSearchBody(section: DocsSection): string {
  return section.text.replace(/\]\([^)\n]*\)/gu, "]").trim();
}

export function docsSectionParts(locale: DocsLocale, section: DocsSection): DocsSectionPart[] {
  const label = docsSectionLabel(section);
  return retrievalSectionParts(docsSectionSearchBody(section)).map((text, partOrdinal) => {
    const embeddingBody = docsEmbeddingBody(text);
    return {
      locale,
      source: section.source,
      slug: section.slug,
      sectionOrder: section.order,
      partOrdinal,
      anchor: section.anchor,
      pageTitle: section.pageTitle,
      headingPath: section.headingPath,
      label,
      text,
      embeddingBody,
      contentHash: sha256(docsEmbeddingText({ label, embeddingBody })),
    };
  });
}

export function docsCorpusBuildHash(parts: readonly DocsSectionPart[]): string {
  return sha256(
    [
      DOCS_CORPUS_SCHEMA,
      DOCS_EMBEDDING_FORMAT,
      ...parts.map((part) =>
        [
          part.locale,
          part.source,
          part.slug,
          part.sectionOrder,
          part.partOrdinal,
          part.anchor,
          part.contentHash,
          sha256(retrievalEmbeddingText(part.label, part.text)),
        ].join("\u0000"),
      ),
    ].join("\n"),
  );
}

export function docsCorpus(): DocsCorpus {
  if (corpus) return corpus;
  const parts: DocsSectionPart[] = [];
  const sections = new Map<string, DocsSection>();
  const sectionParts = new Map<string, DocsSectionPart[]>();
  for (const locale of CONTENT_LOCALES) {
    for (const source of DOCS_CORPUS_SOURCES) {
      for (const section of docsCorpusSections(source, locale)) {
        const key = `${locale}:${docsSectionKey(section)}`;
        const own = docsSectionParts(locale, section);
        sections.set(key, section);
        sectionParts.set(key, own);
        parts.push(...own);
      }
    }
  }
  const buildHash = docsCorpusBuildHash(parts);
  corpus = { buildHash, parts, sections, sectionParts };
  return corpus;
}

export function docsCorpusSection(
  locale: DocsLocale,
  key: { source: string; slug: string; order: number },
): DocsSection | undefined {
  return docsCorpus().sections.get(`${locale}:${docsSectionKey(key)}`);
}

export function docsCorpusSectionParts(locale: DocsLocale, section: DocsSection): DocsSectionPart[] {
  return docsCorpus().sectionParts.get(`${locale}:${docsSectionKey(section)}`) ?? docsSectionParts(locale, section);
}
