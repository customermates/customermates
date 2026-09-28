import type { WikiEmbeddingService } from "../wiki-embedding.service";

import { describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

import { WikiSemanticQueryEmbedder } from "../wiki-query-embedder";

function embeddings() {
  const embedTexts = vi.fn((_grant: unknown, texts: string[]) => Promise.resolve(texts.map(() => [0.5, 0.5])));
  const authorizeQuery = vi.fn((payer: { id: string; companyId: string }) =>
    Promise.resolve({ purpose: "wikiRetrieval", companyId: payer.companyId, userId: payer.id }),
  );
  return { service: { authorizeQuery, embedTexts } as unknown as WikiEmbeddingService, embedTexts };
}

describe("Wiki query embedding cache", () => {
  it("never lets one workspace's cached query skip another workspace's charge", async () => {
    const { service, embedTexts } = embeddings();
    const query = `refund policy ${crypto.randomUUID()}`;
    const first = createMockUser({ id: crypto.randomUUID(), companyId: crypto.randomUUID() });
    const colleague = createMockUser({ id: crypto.randomUUID(), companyId: first.companyId });
    const other = createMockUser({ id: crypto.randomUUID(), companyId: crypto.randomUUID() });
    const embed = (user: typeof first) =>
      runWithTenant(user, () => new WikiSemanticQueryEmbedder(service).embedQuery(query));

    await embed(first);
    await embed(colleague);
    await embed(other);

    expect(embedTexts).toHaveBeenCalledTimes(2);
    expect(embedTexts.mock.calls.map(([grant]) => (grant as { companyId: string }).companyId)).toEqual([
      first.companyId,
      other.companyId,
    ]);
  });

  it("embeds one query once when several searches in the same request ask for it together", async () => {
    const { service, embedTexts } = embeddings();
    const user = createMockUser({ id: crypto.randomUUID(), companyId: crypto.randomUUID() });
    const query = `webhook signature ${crypto.randomUUID()}`;

    const vectors = await runWithTenant(user, () =>
      Promise.all([
        new WikiSemanticQueryEmbedder(service).embedQuery(query),
        new WikiSemanticQueryEmbedder(service).embedQuery(` ${query} `),
      ]),
    );

    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect(vectors[0]).toEqual(vectors[1]);
  });
});
