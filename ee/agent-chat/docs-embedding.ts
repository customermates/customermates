import type { DocsEmbeddingModelKey } from "@/core/config/environment";
import type { DocsSection } from "@/features/mcp-tools/docs-retrieval";
import type { DocsEmbeddingSearch, DocsSectionRanker, SearchDocsInput } from "@/features/mcp-tools/docs.mcp-tools";
import type { ContentLocale } from "@/i18n/locale-registry";

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { DOCS_EMBEDDING_MODELS, runEmbedding } from "./classifier/embedding-runner";
import { embedQueryMetered, hostedDocsEmbeddingModel, recordDocsSearch } from "./classifier/metered";
import { docsRerankPlainText } from "./docs-rerank";

import { docsEmbeddingSections, searchDocsRanked } from "@/features/mcp-tools/docs.mcp-tools";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

export const DOCS_EMBEDDING_TIMEOUT_MS = 1_200;
export const DOCS_EMBEDDING_SECTION_CHARS = 2_000;
export const DOCS_EMBEDDING_RANKED = 40;
const DOCS_EMBEDDING_BATCH = 64;
export const DOCS_EMBEDDING_BATCH_CHARS = 30_000;
const DOCS_EMBEDDING_RETRY_MS = 60_000;

type CacheFile = { model: string; vectors: Record<string, string> };
type IndexState = { vectors: Float32Array[] | null; building: Promise<Float32Array[]> | null; failedAt: number };

const states = new Map<string, IndexState>();

export function docsEmbeddingSectionText(section: DocsSection): string {
  const title = [section.pageTitle, ...section.headingPath].join(" > ");
  return `${title}\n${docsRerankPlainText(section.text)}`.slice(0, DOCS_EMBEDDING_SECTION_CHARS);
}

export function docsEmbeddingQueryText(model: DocsEmbeddingModelKey, query: string): string {
  return `${DOCS_EMBEDDING_MODELS[model].queryPrefix}${query}`;
}

export function docsEmbeddingKey(model: DocsEmbeddingModelKey, text: string): string {
  return createHash("sha256").update(`${DOCS_EMBEDDING_MODELS[model].modelId}\u0000${text}`).digest("hex");
}

export function docsEmbeddingCachePath(model: DocsEmbeddingModelKey, root = process.cwd()): string {
  return join(root, "generated", "docs-embeddings", `${model}.json`);
}

export function normalizedVector(values: readonly number[]): Float32Array {
  const norm = Math.sqrt(values.reduce((total, value) => total + value * value, 0)) || 1;
  return Float32Array.from(values, (value) => value / norm);
}

function encodeVector(vector: Float32Array): string {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength).toString("base64");
}

function decodeVector(encoded: string): Float32Array {
  const bytes = Buffer.from(encoded, "base64");
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

export function docsEmbeddingBatches<T extends readonly [string, string]>(entries: readonly T[]): T[][] {
  const batches: T[][] = [];
  let chars = 0;
  for (const entry of entries) {
    const last = batches.at(-1);
    if (!last || last.length >= DOCS_EMBEDDING_BATCH || chars + entry[1].length > DOCS_EMBEDDING_BATCH_CHARS) {
      batches.push([entry]);
      chars = entry[1].length;
    } else {
      last.push(entry);
      chars += entry[1].length;
    }
  }
  return batches;
}

async function writeCache(path: string, model: DocsEmbeddingModelKey, vectors: Record<string, string>) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ model: DOCS_EMBEDDING_MODELS[model].modelId, vectors }));
}

async function readCache(path: string, model: DocsEmbeddingModelKey): Promise<Record<string, string>> {
  try {
    const file = JSON.parse(await readFile(path, "utf8")) as CacheFile;
    return file.model === DOCS_EMBEDDING_MODELS[model].modelId ? file.vectors : {};
  } catch {
    return {};
  }
}

export async function buildDocsEmbeddingIndex(
  model: DocsEmbeddingModelKey,
  locale: ContentLocale,
  cachePath = docsEmbeddingCachePath(model),
): Promise<Float32Array[]> {
  const texts = docsEmbeddingSections(locale).map(docsEmbeddingSectionText);
  const keys = texts.map((text) => docsEmbeddingKey(model, text));
  const cached = await readCache(cachePath, model);
  const missing = [...new Map(keys.flatMap((key, index) => (cached[key] ? [] : [[key, texts[index]] as const])))];
  for (const batch of docsEmbeddingBatches(missing)) {
    const { embeddings } = await runEmbedding(
      model,
      batch.map(([, text]) => text),
    );
    batch.forEach(([key], index) => (cached[key] = encodeVector(normalizedVector(embeddings[index]))));
  }
  if (missing.length > 0) await writeCache(cachePath, model, cached).catch(() => undefined);
  return keys.map((key) => decodeVector(cached[key]));
}

export function readyDocsEmbeddingIndex(
  model: DocsEmbeddingModelKey,
  locale: ContentLocale,
  now = Date.now(),
): Float32Array[] | null {
  const key = `${model}:${locale}`;
  const state = states.get(key) ?? { vectors: null, building: null, failedAt: -Infinity };
  states.set(key, state);
  if (state.vectors) return state.vectors;
  if (!state.building && now - state.failedAt >= DOCS_EMBEDDING_RETRY_MS) {
    state.building = buildDocsEmbeddingIndex(model, locale);
    state.building.then(
      (vectors) => {
        state.vectors = vectors;
        state.building = null;
      },
      () => {
        state.failedAt = Date.now();
        state.building = null;
      },
    );
  }
  return null;
}

export async function warmDocsEmbeddingIndex(model: DocsEmbeddingModelKey, locale: ContentLocale) {
  readyDocsEmbeddingIndex(model, locale);
  const state = states.get(`${model}:${locale}`);
  if (state?.building) await state.building.catch(() => undefined);
  return Boolean(state?.vectors);
}

export function rankSectionsByEmbedding(
  vectors: readonly Float32Array[],
  query: readonly number[],
  limit = DOCS_EMBEDDING_RANKED,
): number[] {
  const target = normalizedVector(query);
  return vectors
    .flatMap((vector, id) => {
      if (vector.length !== target.length) return [];
      let score = 0;
      for (let index = 0; index < vector.length; index += 1) score += vector[index] * target[index];
      return [{ id, score }];
    })
    .sort((left, right) => right.score - left.score || left.id - right.id)
    .slice(0, limit)
    .map(({ id }) => id);
}

export function docsEmbeddingSearch(
  model: DocsEmbeddingModelKey,
  timeoutMs = DOCS_EMBEDDING_TIMEOUT_MS,
): DocsEmbeddingSearch {
  return async (query, locale) => {
    const vectors = readyDocsEmbeddingIndex(model, locale);
    if (!vectors) return null;
    const { embedding } = await embedQueryMetered(model, docsEmbeddingQueryText(model, query), timeoutMs);
    return embedding ? rankSectionsByEmbedding(vectors, embedding) : null;
  };
}

export function hostedDocsEmbeddingSearch(): DocsEmbeddingSearch | undefined {
  const model = hostedDocsEmbeddingModel();
  if (!model) return undefined;
  for (const locale of CONTENT_LOCALES) readyDocsEmbeddingIndex(model, locale);
  return docsEmbeddingSearch(model);
}

export async function searchDocsTraced(
  input: SearchDocsInput,
  rank: DocsSectionRanker,
  embeddingSearch?: DocsEmbeddingSearch,
  now: () => number = () => performance.now(),
) {
  const started = now();
  let hybrid = false;
  const tracked: DocsEmbeddingSearch | undefined = embeddingSearch
    ? async (query, locale) => {
        const ids = await embeddingSearch(query, locale);
        hybrid = ids !== null;
        return ids;
      }
    : undefined;
  const result = await searchDocsRanked(input, rank, tracked);
  if (input.source === "docs") recordDocsSearch(now() - started, hybrid);
  return result;
}
