import { z } from "zod";

import { env } from "@/env";

export const PublicWebSearchQuerySchema = z.string().trim().min(1).max(500);
export const PUBLIC_WEB_SEARCH_MAX_RESPONSE_BYTES = 32_768;
export const PUBLIC_WEB_SEARCH_TIMEOUT_MS = 15_000;
export const PUBLIC_WEB_SEARCH_MAX_RESULT_CHARACTERS = 6_000;
const MAX_RESULTS = 3;
const MAX_RESULT_CHARACTERS = 1_900;
const MAX_SOURCE_LENGTH = 1_000;
const NON_BILLED_STATUSES = new Set([400, 401, 403, 422, 429]);

export type PublicWebSearchOutput = {
  ok: boolean;
  results?: { title: string; url: string; snippet: string }[];
  result?: string;
};

export type PublicWebSearchResult =
  | {
      state: "settled";
      billed: boolean;
      output: PublicWebSearchOutput;
      providerRequestId?: string;
    }
  | { state: "uncertain" };

type PublicWebSearchOptions = {
  fetch?: typeof fetch;
  apiKey?: string;
  abortSignal?: AbortSignal;
};

const SearchResponseSchema = z.object({
  id: z.string().optional(),
  results: z.array(z.object({ title: z.string(), url: z.string(), snippet: z.string() })),
});

class SearchResponseTooLarge extends Error {}
class SearchResponseInvalid extends Error {}

function failed(billed: boolean, result: string): PublicWebSearchResult {
  return { state: "settled", billed, output: { ok: false, result } };
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error("Search interrupted."));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

async function readResponse(response: Response, signal: AbortSignal): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > PUBLIC_WEB_SEARCH_MAX_RESPONSE_BYTES) throw new SearchResponseTooLarge();
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > PUBLIC_WEB_SEARCH_MAX_RESPONSE_BYTES) throw new SearchResponseTooLarge();
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new SearchResponseInvalid();
  }
}

function canonicalHttpsSource(value: string): string | null {
  if (value.length > MAX_SOURCE_LENGTH) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    const source = url.toString();
    return source.length <= MAX_SOURCE_LENGTH ? source : null;
  } catch {
    return null;
  }
}

function boundedResult(source: { title: string; url: string; snippet: string }) {
  const result = {
    title: source.title.trim().slice(0, 200),
    url: source.url,
    snippet: source.snippet.trim().slice(0, 1_200),
  };
  for (const field of ["snippet", "title"] as const) {
    while (JSON.stringify(result).length > MAX_RESULT_CHARACTERS && result[field].length > 0) {
      const excess = JSON.stringify(result).length - MAX_RESULT_CHARACTERS;
      result[field] = result[field].slice(0, Math.max(0, result[field].length - excess));
    }
  }
  return result;
}

export async function executePublicWebSearch(
  query: unknown,
  options: PublicWebSearchOptions = {},
): Promise<PublicWebSearchResult> {
  const parsed = PublicWebSearchQuerySchema.safeParse(query);
  if (!parsed.success) return failed(false, "Search requires one query between 1 and 500 characters.");
  const apiKey = options.apiKey ?? env.PERPLEXITY_API_KEY;
  if (!apiKey?.trim() || /\s/u.test(apiKey)) return failed(false, "Web search is not configured.");
  if (options.abortSignal?.aborted) return failed(false, "Web search was cancelled before it started.");

  const controller = new AbortController();
  const onAbort = () => controller.abort(options.abortSignal?.reason);
  options.abortSignal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("Search timed out.")), PUBLIC_WEB_SEARCH_TIMEOUT_MS);
  let response: Response | undefined;
  try {
    response = await abortable(
      (options.fetch ?? fetch)("https://api.perplexity.ai/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query: parsed.data,
          max_results: MAX_RESULTS,
          max_tokens: 1_024,
          max_tokens_per_page: 512,
        }),
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      }),
      controller.signal,
    );
    if (response.status >= 300 && response.status < 400) return { state: "uncertain" };
    const body = await readResponse(response, controller.signal);
    if (NON_BILLED_STATUSES.has(response.status) || (response.status >= 500 && response.status <= 599))
      return failed(false, "The search provider could not complete this request.");

    if (response.status !== 200) return { state: "uncertain" };
    if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
      return failed(true, "The search provider returned an unusable response.");

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return failed(true, "The search provider returned an unusable response.");
    }
    const data = SearchResponseSchema.safeParse(json);
    if (!data.success) return failed(true, "The search provider returned an unusable response.");
    const results: NonNullable<PublicWebSearchOutput["results"]> = [];
    const sources = new Set<string>();
    for (const source of data.data.results) {
      const url = canonicalHttpsSource(source.url);
      if (!url || sources.has(url)) continue;
      sources.add(url);
      results.push(boundedResult({ ...source, url }));
      if (results.length === MAX_RESULTS) break;
    }
    return {
      state: "settled",
      billed: true,
      output: { ok: true, results },
      ...(data.data.id && /^[a-zA-Z0-9_-]{1,200}$/u.test(data.data.id) ? { providerRequestId: data.data.id } : {}),
    };
  } catch (error) {
    if (response?.status === 200 && (error instanceof SearchResponseTooLarge || error instanceof SearchResponseInvalid))
      return failed(true, "The search provider returned an unusable response.");
    return { state: "uncertain" };
  } finally {
    clearTimeout(timeout);
    options.abortSignal?.removeEventListener("abort", onAbort);
    controller.abort();
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
  }
}
