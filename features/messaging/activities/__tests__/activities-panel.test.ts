import type { ComponentProps, ReactNode } from "react";
import type { FilterPopover } from "@/components/data-view/header/filter-popover";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityType } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  filterProps: null as ComponentProps<typeof FilterPopover> | null,
  store: {
    customColumns: [],
    dataRequest: { status: "ready" },
    filters: [],
    hasMore: false,
    items: [{ id: "activity-1" }],
    loadOlder: vi.fn(),
    loading: false,
    olderPageError: false,
    pageLimitReached: false,
    scope: { contactId: "60000000-0000-4000-8000-000000000023" },
    scopeTruncated: false,
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/components/data-view/header/filter-popover", () => ({
  FilterPopover: (props: ComponentProps<typeof FilterPopover>) => {
    harness.filterProps = props;
    return createElement("button", { type: "button" }, "Filters");
  },
}));
vi.mock("@/components/page-state/page-state", () => ({
  PageState: () => null,
}));
vi.mock("../activities-list", () => ({
  ActivitiesList: () => createElement("div", null, "Activity"),
  TimelineEmptyState: () => null,
  TimelineNotice: () => null,
}));
vi.mock("../activity-timeline-skeleton", () => ({
  ActivityTimelineSkeleton: () => null,
}));
vi.mock("../activity-query-context", () => ({
  ActivityQueryProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../use-owned-activities-store", () => ({
  useOwnedActivitiesStore: () => harness.store,
}));

import { EntityTimelinePanel } from "../activities-panel";

describe("EntityTimelinePanel", () => {
  beforeEach(() => {
    harness.filterProps = null;
  });

  it("keeps timeline filters without registering hidden saved-view context", () => {
    const html = renderToStaticMarkup(
      createElement(EntityTimelinePanel, {
        entityId: "60000000-0000-4000-8000-000000000023",
        entityType: EntityType.contact,
        initial: {} as never,
      }),
    );

    expect(html).toContain("Filters");
    expect(harness.filterProps).toEqual(
      expect.objectContaining({
        compact: true,
        store: harness.store,
      }),
    );
    expect(harness.filterProps).not.toHaveProperty("registerPageContext");
  });
});
