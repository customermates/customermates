import { describe, expect, it } from "vitest";

import { WIKI_EMBEDDING_MODEL } from "@/ee/wiki-retrieval/wiki-embedding-model";

import { isRetrievalUsage, usageFollowsRoute } from "../usage-route";

const MODEL = "google/gemini-3-flash";

describe("integrity:correctRoute usage check", () => {
  it("passes a unified-retrieval episode whose only other usage is the query embedding", () => {
    expect(
      usageFollowsRoute(
        [
          { model: MODEL, purpose: "turn" },
          { model: WIKI_EMBEDDING_MODEL, purpose: "wikiRetrieval" },
          { model: WIKI_EMBEDDING_MODEL },
        ],
        MODEL,
      ),
    ).toBe(true);
  });

  it("still fails a turn charged under another chat model", () => {
    expect(usageFollowsRoute([{ model: "openai/gpt-5", purpose: "turn" }], MODEL)).toBe(false);
    expect(usageFollowsRoute([{ model: "openai/gpt-5" }], MODEL)).toBe(false);
  });

  it("treats retrieval and indexing purposes and the embedding model as retrieval usage, and turns as turns", () => {
    expect(isRetrievalUsage({ model: "any", purpose: "wikiIndexing" })).toBe(true);
    expect(isRetrievalUsage({ model: WIKI_EMBEDDING_MODEL, purpose: "turn" })).toBe(true);
    expect(isRetrievalUsage({ model: MODEL, purpose: "turn" })).toBe(false);
    expect(isRetrievalUsage({ model: MODEL })).toBe(false);
  });
});
