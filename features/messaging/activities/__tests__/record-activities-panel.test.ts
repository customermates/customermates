import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordActivitiesResult } from "@/ee/messaging/activities/record-activities.schema";

const mocked = vi.hoisted(() => ({ action: vi.fn(), listeners: new Set<() => unknown>() }));
const rootStore = {
  recordWorkspaceStore: {
    subscribe: (fn: () => unknown) => {
      mocked.listeners.add(fn);
      return () => {
        mocked.listeners.delete(fn);
      };
    },
  },
};
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/app/[locale]/(protected)/records/actions", () => ({ getRecordActivitiesAction: mocked.action }));
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
  mocked.listeners.clear();
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
const mount = () => settle(() => root.render(createElement(RecordActivitiesPanel, { record })));
const refresh = () =>
  settle(() => {
    for (const listener of mocked.listeners) void listener();
  });

describe("generic record activity requests", () => {
  it("keeps the last complete page during refresh failures and recovers on retry", async () => {
    mocked.action
      .mockResolvedValueOnce(result("saved"))
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(result("recovered"));
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
    mocked.action
      .mockResolvedValueOnce(result("initial", true))
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    await mount();
    const older = [...container.querySelectorAll("button")].find((button) => button.textContent === "Older");
    await settle(() => {
      older?.click();
      older?.click();
    });
    expect(mocked.action).toHaveBeenCalledTimes(2);
    expect(mocked.action.mock.calls[1][0].cursor).toEqual(result("initial", true).data.nextCursor);
    await refresh();
    await settle(() => fresh.resolve(result("latest")));
    await settle(() => old.resolve(result("stale")));
    expect(container.textContent).toContain("latest");
    expect(container.textContent).not.toContain("stale");
    expect(container.textContent).not.toContain("initial");
  });

  it("does not reuse a previous record's page after the owning drawer changes", async () => {
    const pending = deferred();
    mocked.action.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(result("replacement"));
    await mount();
    const next = { ...record, recordId: "00000000-0000-4000-8000-000000000003" };
    await settle(() => root.render(createElement(RecordActivitiesPanel, { key: next.recordId, record: next })));
    await settle(() => pending.resolve(result("closed")));
    expect(container.textContent).toContain("replacement");
    expect(container.textContent).not.toContain("closed");
    expect(mocked.listeners.size).toBe(1);
    expect(mocked.action.mock.calls[1][0].scope.records).toEqual([next]);
  });
});
