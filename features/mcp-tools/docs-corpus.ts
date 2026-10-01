import type { DocsSection } from "./docs-sections";

import { createHash } from "node:crypto";

import { retrievalChunkText, retrievalWindows } from "@/core/retrieval/retrieval-chunks";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";
import { DOCS_EMBEDDING_FORMAT, docsEmbeddingBody, docsEmbeddingText } from "./docs-embedding-input";

import { docsCorpusSections, type DocsLocale, type DocsSource } from "./docs-manifest";

const DOCS_CORPUS_SCHEMA = "docs-chunks-v1";
export const DOCS_CORPUS_SOURCES: readonly DocsSource[] = ["docs", "api"];

export type DocsChunk = {
  locale: DocsLocale;
  source: DocsSource;
  slug: string;
  sectionOrder: number;
  chunkOrdinal: number;
  charOffset: number;
  anchor: string;
  pageTitle: string;
  headingPath: string[];
  label: string;
  body: string;
  embeddingBody: string;
  contentHash: string;
};

export type DocsCorpus = {
  buildHash: string;
  chunks: DocsChunk[];
  sections: Map<string, DocsSection>;
};

let corpus: DocsCorpus | undefined;

export function docsSectionKey(section: { source: string; slug: string; order: number }): string {
  return `${section.source}:${section.slug}:${section.order}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function docsChunkLabel(section: DocsSection): string {
  const heading = section.headingPath.join(" > ");
  return heading && heading !== section.pageTitle ? `${section.pageTitle} > ${heading}` : section.pageTitle;
}

export function docsSectionSearchBody(section: DocsSection): string {
  return section.text.replace(/\]\([^)\n]*\)/gu, "]").trim();
}

export function docsSectionChunks(locale: DocsLocale, section: DocsSection): DocsChunk[] {
  const label = docsChunkLabel(section);
  const body = docsSectionSearchBody(section);
  return retrievalWindows(body).map((window, chunkOrdinal) => {
    const embeddingBody = docsEmbeddingBody(body, window);
    return {
      locale,
      source: section.source,
      slug: section.slug,
      sectionOrder: section.order,
      chunkOrdinal,
      charOffset: window.offset,
      anchor: section.anchor,
      pageTitle: section.pageTitle,
      headingPath: section.headingPath,
      label,
      body: window.text,
      embeddingBody,
      contentHash: sha256(docsEmbeddingText({ label, embeddingBody })),
    };
  });
}

export function docsCorpusBuildHash(chunks: readonly DocsChunk[]): string {
  return sha256(
    [
      DOCS_CORPUS_SCHEMA,
      DOCS_EMBEDDING_FORMAT,
      ...chunks.map((chunk) =>
        [
          chunk.locale,
          chunk.source,
          chunk.slug,
          chunk.sectionOrder,
          chunk.chunkOrdinal,
          chunk.charOffset,
          chunk.anchor,
          chunk.contentHash,
          sha256(retrievalChunkText(chunk.label, chunk.body)),
        ].join("\u0000"),
      ),
    ].join("\n"),
  );
}

export function docsCorpus(): DocsCorpus {
  if (corpus) return corpus;
  const chunks: DocsChunk[] = [];
  const sections = new Map<string, DocsSection>();
  for (const locale of CONTENT_LOCALES) {
    for (const source of DOCS_CORPUS_SOURCES) {
      for (const section of docsCorpusSections(source, locale)) {
        sections.set(`${locale}:${docsSectionKey(section)}`, section);
        chunks.push(...docsSectionChunks(locale, section));
      }
    }
  }
  const buildHash = docsCorpusBuildHash(chunks);
  corpus = { buildHash, chunks, sections };
  return corpus;
}

export function docsCorpusSection(
  locale: DocsLocale,
  key: { source: string; slug: string; order: number },
): DocsSection | undefined {
  return docsCorpus().sections.get(`${locale}:${docsSectionKey(key)}`);
}
