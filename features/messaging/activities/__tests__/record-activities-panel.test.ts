import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordActivitiesResult } from "@/ee/messaging/activities/record-activities.schema";

const mocked = vi.hoisted(() => ({
  action: vi.fn(),
  presentation: vi.fn(),
  listeners: new Set<() => unknown>(),
  params: new URLSearchParams(),
  paramListeners: new Set<() => void>(),
}));
function setParams(params: Record<string, string>) {
  mocked.params = new URLSearchParams(params);
  for (const listener of mocked.paramListeners) listener();
}
const rootStore = {
  localeStore: { getTranslation: (key: string) => key },
  recordWorkspaceStore: {
    subscribe: (fn: () => unknown) => {
      mocked.listeners.add(fn);
      return () => {
        mocked.listeners.delete(fn);
      };
    },
  },
};
vi.mock("@/app/actions", () => ({
  saveDataViewStateAction: vi.fn(),
  selectDataViewAction: vi.fn(() => Promise.resolve()),
}));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    mocked.paramListeners.add(listener);
    return () => mocked.paramListeners.delete(listener);
  };
  return { useSearchParams: () => useSyncExternalStore(subscribe, () => mocked.params) };
});
vi.mock("@/components/data-view/views/data-view-views-rail", () => ({ DataViewViewsRail: () => null }));
vi.mock("@/components/data-view/header/filter-popover", () => ({ FilterPopover: () => null }));
vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("@/app/[locale]/(protected)/records/actions", () => ({
  getRecordActivitiesAction: mocked.action,
  getRecordActivityPresentationAction: mocked.presentation,
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => rootStore }));
vi.mock("../activity-timeline-skeleton", () => ({
  ActivityTimelineSkeleton: () => createElement("div", null, "Loading"),
}));
vi.mock("../activities-list", () => ({
  TimelineNotice: ({ label }: { label: string }) => createElement("div", null, label),
  TimelineEmptyState: ({ label }: { label: string }) => createElement("div", null, label),
  ActivitiesList: ({
    items,
    hasMore,
    onLoadOlder,
  }: {
    items: RecordActivitiesResult["items"];
    hasMore: boolean;
    onLoadOlder: () => void;
  }) =>
    createElement(
      "div",
      null,
      items.map((entry) => createElement("p", { key: entry.id }, entry.id)),
      hasMore && createElement("button", { onClick: onLoadOlder }, "Older"),
    ),
}));
vi.mock("@/components/ui/dropdown-menu", () => {
  const Wrapper = ({ children }: { children: ReactNode }) => createElement("div", null, children);
  return {
    DropdownMenu: Wrapper,
    DropdownMenuTrigger: Wrapper,
    DropdownMenuContent: Wrapper,
    DropdownMenuCheckboxItem: Wrapper,
  };
});

import { RecordActivitiesPanel } from "../record-activities-panel";

const record = { typeId: "00000000-0000-4000-8000-000000000001", recordId: "00000000-0000-4000-8000-000000000002" };
const result = (id: string, hasMore = false) => ({
  ok: true,
  data: {
    items: [{ kind: "audit", id }] as RecordActivitiesResult["items"],
    availableSources: ["audit"],
    nextCursor: hasMore ? { kind: "audit", at: "2020-01-01T00:00:00.000000Z", id } : null,
  },
});
function deferred() {
  let resolve: (value: unknown) => void = () => {
    throw new Error("Deferred request not initialized");
  };
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let root: Root;
let container: HTMLElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocked.action.mockReset();
  mocked.presentation.mockReset();
  mocked.listeners.clear();
  mocked.params = new URLSearchParams();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const settle = (update: () => void) =>
  act(async () => {
    update();
    await Promise.resolve();
  });
const presentation = (id: string, hasMore = false) => ({
  ...result(id, hasMore).data,
  columns: [],
  filters: [],
  views: [],
  activeViewKey: "__all__",
  allState: {},
  p13nId: "entity-timeline",
});
const mount = () => settle(() => root.render(createElement(RecordActivitiesPanel, { record })));
const refresh = () =>
  settle(() => {
    for (const listener of mocked.listeners) void listener();
  });

describe("generic record activity requests", () => {
  it("keeps the last complete page during refresh failures and recovers on retry", async () => {
    mocked.presentation
      .mockResolvedValueOnce(presentation("saved"))
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(presentation("recovered"));
    await mount();
    expect(container.textContent).toContain("saved");
    await refresh();
    expect(container.textContent).toContain("saved");
    expect(container.textContent).toContain("EntityTimeline.error");
    const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "ErrorCard.retry");
    expect(retry).toBeDefined();
    await settle(() => retry?.click());
    expect(container.textContent).toContain("recovered");
    expect(container.textContent).not.toContain("saved");
    expect(container.textContent).not.toContain("EntityTimeline.error");
  });

  it("ignores an older-page response after a newer invalidation refresh", async () => {
    const old = deferred();
    const fresh = deferred();
    mocked.presentation.mockResolvedValueOnce(presentation("initial", true)).mockReturnValueOnce(fresh.promise);
    mocked.action.mockReturnValueOnce(old.promise);
    await mount();
    const older = [...container.querySelectorAll("button")].find((button) => button.textContent === "Older");
    await settle(() => {
      older?.click();
      older?.click();
    });
    expect(mocked.action).toHaveBeenCalledTimes(1);
    expect(mocked.action.mock.calls[0][0].cursor).toEqual(result("initial", true).data.nextCursor);
    await refresh();
    await settle(() => fresh.resolve(presentation("latest")));
    await settle(() => old.resolve(result("stale")));
    expect(container.textContent).toContain("latest");
    expect(container.textContent).not.toContain("stale");
    expect(container.textContent).not.toContain("initial");
  });

  it("does not reuse a previous record's page after the owning drawer changes", async () => {
    const pending = deferred();
    mocked.presentation.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(presentation("replacement"));
    await mount();
    const next = { ...record, recordId: "00000000-0000-4000-8000-000000000003" };
    await settle(() => root.render(createElement(RecordActivitiesPanel, { key: next.recordId, record: next })));
    await settle(() => pending.resolve(presentation("closed")));
    expect(container.textContent).toContain("replacement");
    expect(container.textContent).not.toContain("closed");
    expect(mocked.listeners.size).toBe(1);
    expect(mocked.presentation.mock.calls[1][0].record).toEqual(next);
  });
});

describe("record activity view selection from the URL", () => {
  it("keeps the panel store and applies a URL view change inside the existing store", async () => {
    const views = ["first", "second"].map((id, position) => ({ id, name: id, position, state: {} }));
    mocked.params = new URLSearchParams({ viewSurface: "entity-timeline", view: "first" });
    mocked.presentation
      .mockResolvedValueOnce({ ...presentation("saved"), views, activeViewKey: "first" })
      .mockResolvedValueOnce({ ...presentation("second-view"), views, activeViewKey: "second" });
    await settle(() => root.render(createElement(RecordActivitiesPanel, { record, viewSyncToUrl: true })));
    expect(mocked.presentation).toHaveBeenCalledTimes(1);
    expect(mocked.presentation.mock.calls[0][0].params.viewId).toBe("first");
    expect(container.textContent).toContain("saved");
    expect(mocked.listeners.size).toBe(1);
    const listener = [...mocked.listeners][0];

    await settle(() => setParams({ viewSurface: "entity-timeline", view: "first" }));
    expect(mocked.presentation).toHaveBeenCalledTimes(1);

    await settle(() => setParams({ viewSurface: "entity-timeline", view: "second" }));
    await act(() => vi.waitFor(() => expect(mocked.presentation).toHaveBeenCalledTimes(2)));
    expect(mocked.listeners.size).toBe(1);
    expect([...mocked.listeners][0]).toBe(listener);
    expect(mocked.presentation.mock.calls[1][0].params.viewId).toBe("second");
    await act(() => vi.waitFor(() => expect(container.textContent).toContain("second-view")));
  });
});
