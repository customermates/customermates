import { describe, expect, it, vi } from "vitest";

import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";

import { WEBHOOK_OPTION_PAGE_SIZE, loadWebhookOptions } from "../components/automation-webhook-options";

function hook(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `hook-${index}`,
    enabled: true,
    description: null,
    url: `https://example.test/${index}`,
    events: ["automation.rule.fired"],
    ...overrides,
  };
}

function page(items: ReturnType<typeof hook>[], totalPages: number) {
  return { ok: true as const, data: { items, pagination: { totalPages } } };
}

describe("the webhooks a rule can call", () => {
  it("reads every page, not only the first, and offers the enabled hooks", async () => {
    const pages = [
      page([hook(1), hook(2, { enabled: false })], 3),
      page([hook(3, { description: "Billing sync" })], 3),
      page([hook(4)], 3),
    ];
    const loadPage = vi.fn((number: number) => Promise.resolve(pages[number - 1] ?? page([], 3)));

    const options = await loadWebhookOptions(loadPage);

    expect(loadPage.mock.calls).toEqual([
      [1, WEBHOOK_OPTION_PAGE_SIZE],
      [2, WEBHOOK_OPTION_PAGE_SIZE],
      [3, WEBHOOK_OPTION_PAGE_SIZE],
    ]);
    expect(options).toEqual([
      { id: "hook-1", label: "https://example.test/1", subscribed: true },
      { id: "hook-3", label: "Billing sync", subscribed: true },
      { id: "hook-4", label: "https://example.test/4", subscribed: true },
    ]);
  });

  it("marks a webhook that has not selected the automation event, so the picker can leave it out", async () => {
    const hooks = [
      hook(1, { events: ["record.created"] }),
      hook(2, { events: ["record.created", "automation.rule.fired"] }),
    ];

    expect(await loadWebhookOptions(() => Promise.resolve(page(hooks, 1)))).toEqual([
      { id: "hook-1", label: "https://example.test/1", subscribed: false },
      { id: "hook-2", label: "https://example.test/2", subscribed: true },
    ]);
  });

  it("stops on an empty page even when the page count is wrong", async () => {
    const loadPage = vi.fn(() => Promise.resolve(page([], 99)));

    expect(await loadWebhookOptions(loadPage)).toEqual([]);
    expect(loadPage).toHaveBeenCalledTimes(1);
  });

  it("answers 'not visible' instead of an empty list for a member without API access", async () => {
    const denied = () => Promise.reject(new ForbiddenError("Not authorized", AppErrorCode.permissionDenied));

    expect(await loadWebhookOptions(denied)).toBeNull();
    expect(await loadWebhookOptions(() => Promise.resolve({ ok: false as const }))).toBeNull();
  });

  it("lets any other failure through", async () => {
    await expect(loadWebhookOptions(() => Promise.reject(new Error("database down")))).rejects.toThrow("database down");
  });
});
