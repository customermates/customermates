import { afterEach, describe, expect, it, vi } from "vitest";
import type * as ModelPricingSnapshot from "../model-pricing.snapshot";

async function importCatalogWithWebSearchPrice(price: string | undefined) {
  vi.resetModules();
  vi.doMock("../model-pricing.snapshot", async () => {
    const actual = await vi.importActual<typeof ModelPricingSnapshot>("../model-pricing.snapshot");
    const endpoints = actual.MODEL_PRICING_SNAPSHOT.endpoints.map((endpoint) => {
      const copy: Record<string, unknown> = { ...endpoint };
      if (price === undefined) delete copy.webSearchUsdPerThousandCalls;
      else copy.webSearchUsdPerThousandCalls = price;
      return copy;
    });

    return {
      MODEL_PRICING_SNAPSHOT: {
        ...actual.MODEL_PRICING_SNAPSHOT,
        endpoints,
      },
    };
  });

  return import("../model-catalog");
}

afterEach(() => {
  vi.doUnmock("../model-pricing.snapshot");
  vi.resetModules();
});

describe("web-search settlement boundary", () => {
  it.each(["0", "0.000"])("enables web search when it has no separate provider charge (%s)", async (price) => {
    const catalog = await importCatalogWithWebSearchPrice(price);

    expect(catalog.isAgentModelWebSearchEnabled(catalog.MODEL_CATALOG.balanced)).toBe(true);
  });

  it("keeps the Assistant servable but disables web search when it has a separate charge", async () => {
    const catalog = await importCatalogWithWebSearchPrice("0.001");

    expect(catalog.MODEL_CATALOG.balanced).toBeDefined();
    expect(catalog.isAgentModelWebSearchEnabled(catalog.MODEL_CATALOG.balanced)).toBe(false);
  });

  it("keeps the Assistant servable but disables web search when pricing is absent", async () => {
    const catalog = await importCatalogWithWebSearchPrice(undefined);

    expect(catalog.MODEL_CATALOG.balanced).toBeDefined();
    expect(catalog.isAgentModelWebSearchEnabled(catalog.MODEL_CATALOG.balanced)).toBe(false);
  });
});
