import { beforeEach, describe, expect, it, vi } from "vitest";

import { FilterFieldKey } from "@/core/types/filter-field-key";

const { getWebhooksAction, resolveWebhookOptionsAction } = vi.hoisted(() => ({
  getWebhooksAction: vi.fn(),
  resolveWebhookOptionsAction: vi.fn(),
}));

vi.mock("@/app/[locale]/(protected)/w/[workspace]/settings/(workspace)/actions", () => ({
  getWebhooksAction,
  resolveWebhookOptionsAction,
}));

const inbox = vi.hoisted(() => ({ getMessagingThreadsAction: vi.fn() }));

vi.mock("@/app/[locale]/(protected)/w/[workspace]/inbox/actions", () => ({
  getMessagingThreadsAction: inbox.getMessagingThreadsAction,
}));

const workspace = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock("@/core/errors/workspace-changed-notice", async () => {
  const { isWorkspaceChangedError, isWorkspaceChangedFailure } = await import("@/core/errors/workspace-changed");
  return {
    hasWorkspaceChanged: () => false,
    notifyIfWorkspaceChanged: (value: unknown) => {
      const changed = isWorkspaceChangedFailure(value) || isWorkspaceChangedError(value);
      if (changed) workspace.notify();
      return changed;
    },
    notifyWorkspaceChanged: workspace.notify,
    registerWorkspaceChangedHandler: () => () => undefined,
  };
});

import { filterOptionSources } from "../use-filter-select-items";

beforeEach(() => vi.clearAllMocks());

describe("paged filter options", () => {
  it("resolves a selected webhook by id beyond the initial option page", async () => {
    const ids = Array.from({ length: 105 }, (_, index) => `hook-${index}`);
    getWebhooksAction.mockResolvedValue({
      ok: true,
      data: {
        items: ids
          .slice(-25)
          .reverse()
          .map((id) => ({
            id,
            url: `https://example.test/${id}`,
            description: null,
          })),
      },
    });
    resolveWebhookOptionsAction.mockResolvedValue({
      ok: true,
      data: [
        {
          id: ids[0],
          url: "https://example.test/old",
          description: "Older subscription",
        },
      ],
    });
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

describe("thread filter options after a workspace change", () => {
  it("opens the reload dialog instead of failing the thread choices", async () => {
    inbox.getMessagingThreadsAction.mockResolvedValue({
      ok: false,
      failure: {
        kind: "conflict",
        issues: [{ code: "custom", path: [], message: "", customCode: "workspaceChanged" }],
      },
    });
    const translate = ((key: string) => key) as unknown as Parameters<typeof filterOptionSources>[0];
    const source = filterOptionSources(translate, { current: null } as never)[FilterFieldKey.timelineThreadId];
    if (!source || !("getItems" in source)) throw new Error("Missing thread source");

    await expect(source.getItems({})).rejects.toMatchObject({ digest: "CUSTOMERMATES_WORKSPACE_CHANGED" });
    expect(workspace.notify).toHaveBeenCalledOnce();
  });

  it("keeps an authorization failure as an empty thread list", async () => {
    inbox.getMessagingThreadsAction.mockResolvedValue({
      ok: false,
      failure: { kind: "authorization", issues: [{ code: "custom", path: [], message: "" }] },
    });
    const translate = ((key: string) => key) as unknown as Parameters<typeof filterOptionSources>[0];
    const source = filterOptionSources(translate, { current: null } as never)[FilterFieldKey.timelineThreadId];
    if (!source || !("getItems" in source)) throw new Error("Missing thread source");

    expect(await source.getItems({})).toEqual({ items: [] });
    expect(workspace.notify).not.toHaveBeenCalled();
  });
});
