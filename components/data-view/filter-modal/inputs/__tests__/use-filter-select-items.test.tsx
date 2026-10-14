import { beforeEach, describe, expect, it, vi } from "vitest";

import { FilterFieldKey } from "@/core/types/filter-field-key";

const { getWebhooksAction, resolveWebhookOptionsAction } = vi.hoisted(() => ({
  getWebhooksAction: vi.fn(),
  resolveWebhookOptionsAction: vi.fn(),
}));

vi.mock("@/app/[locale]/(protected)/settings/(workspace)/actions", () => ({
  getWebhooksAction,
  resolveWebhookOptionsAction,
}));

import { filterOptionSources } from "../use-filter-select-items";

beforeEach(() => vi.clearAllMocks());

describe("paged filter options", () => {
  it("resolves a selected webhook by id beyond the initial option page", async () => {
    const ids = Array.from({ length: 105 }, (_, index) => `hook-${index}`);
    getWebhooksAction.mockResolvedValue({
      items: ids
        .slice(-25)
        .reverse()
        .map((id) => ({
          id,
          url: `https://example.test/${id}`,
          description: null,
        })),
    });
    resolveWebhookOptionsAction.mockResolvedValue([
      {
        id: ids[0],
        url: "https://example.test/old",
        description: "Older subscription",
      },
    ]);
    const translate = ((key: string) => key) as unknown as Parameters<typeof filterOptionSources>[0];
    const source = filterOptionSources(translate, { current: null } as never)[FilterFieldKey.webhookId];
    expect(source && "getItems" in source && "resolveItems" in source).toBe(true);
    if (!source || !("getItems" in source) || !source.resolveItems) throw new Error("Missing webhook source");

    expect((await source.getItems({})).items).toHaveLength(25);
    expect(await source.resolveItems([ids[0]])).toEqual([
      {
        key: ids[0],
        value: ids[0],
        textValue: "https://example.test/old · Older subscription",
      },
    ]);
    expect(resolveWebhookOptionsAction).toHaveBeenCalledWith([ids[0]]);
    expect(getWebhooksAction).toHaveBeenCalledTimes(1);
  });
});
