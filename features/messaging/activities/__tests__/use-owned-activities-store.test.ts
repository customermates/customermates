import type { Root } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";
import type { ActivitiesResult, ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";
import type { ActivitiesStore } from "../activities.store";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EntityType } from "@/generated/prisma";

import { ActivityTimelineRegistry } from "@/core/stores/activity-timeline.registry";

const rootStore = { activityTimelines: new ActivityTimelineRegistry() } as unknown as RootStore;

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => rootStore,
}));
vi.mock("@/app/[locale]/(protected)/actions", () => ({
  getActivitiesAction: vi.fn(),
}));
vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
  upsertP13nAction: vi.fn(),
}));

import { useOwnedActivitiesStore } from "../use-owned-activities-store";

const roots: Root[] = [];
const containers: HTMLElement[] = [];
let renderedStore: ActivitiesStore | null = null;

function entry(id: string): ActivityEntryDto {
  return { id, kind: "audit" } as ActivityEntryDto;
}

function result(id: string): ActivitiesResult {
  return {
    availableSources: ["audit"],
    items: [entry(id)],
    pageLimitReached: false,
    scopeTruncated: false,
  };
}

function Harness({ entityId, initial }: { entityId: string; initial: ActivitiesResult }) {
  renderedStore = useOwnedActivitiesStore({
    initial,
    scope: {
      records: [{ entityType: EntityType.contact, ids: [entityId] }],
    },
  });
  return null;
}

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
  return root;
}

beforeEach(() => {
  renderedStore = null;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  containers.splice(0).forEach((container) => container.remove());
});

describe("useOwnedActivitiesStore", () => {
  it("keeps local state when a parent supplies an equivalent new initial object", () => {
    const entityId = "00000000-0000-4000-8000-000000000001";
    const root = mount(createElement(Harness, { entityId, initial: result("server") }));
    const firstStore = renderedStore;
    expect(firstStore?.items.map(({ id }) => id)).toEqual(["server"]);

    act(() => firstStore?.hydrate(result("local")));
    act(() => root.render(createElement(Harness, { entityId, initial: result("server") })));

    expect(renderedStore).toBe(firstStore);
    expect(renderedStore?.items.map(({ id }) => id)).toEqual(["local"]);
  });

  it("creates and hydrates a new store when the owned scope changes", () => {
    const root = mount(
      createElement(Harness, {
        entityId: "00000000-0000-4000-8000-000000000001",
        initial: result("first"),
      }),
    );
    const firstStore = renderedStore;

    act(() =>
      root.render(
        createElement(Harness, {
          entityId: "00000000-0000-4000-8000-000000000002",
          initial: result("second"),
        }),
      ),
    );

    expect(renderedStore).not.toBe(firstStore);
    expect(renderedStore?.items.map(({ id }) => id)).toEqual(["second"]);
  });
});
