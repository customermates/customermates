import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityType } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  appMode: "cloud" as "cloud" | "demo" | "self-hosted",
  layoutProps: vi.fn(),
  store: {
    customColumns: [],
    entityLoadState: "ready",
    fetchedEntity: { id: "contact-1" },
    requestedEntityId: "contact-1",
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ singular: () => "Contact" }),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    appMode: harness.appMode,
    userStore: {
      canAccess: () => true,
      user: { id: "user-1" },
    },
  }),
}));

vi.mock("@/components/entity-detail/entity-detail.registry", () => ({
  ENTITY_DETAIL: {
    contact: {
      DetailView: () => createElement("div", null, "Details"),
      identity: () => ({ name: "Ada Lovelace" }),
      personalization: () => ({ p13nId: "contact-detail" }),
      showNotesPanel: true,
      store: () => harness.store,
    },
  },
}));

vi.mock("@/components/entity-detail/entity-detail-layout", () => ({
  EntityDetailLayout: (props: Record<string, unknown>) => {
    harness.layoutProps(props);
    return createElement("div", null, "Layout");
  },
}));

vi.mock("@/components/entity-detail/entity-detail-personalization", () => ({
  EntityDetailPersonalizationProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/entity-detail/use-entity-detail-server-snapshot", () => ({
  useEntityDetailServerSnapshot: () => true,
}));

vi.mock("@/features/messaging/activities/activities-panel", () => ({
  EntityTimelinePanel: () => createElement("div", null, "Timeline"),
}));

import { EntityDetailPageView } from "../entity-detail-page-view";

function renderPage() {
  renderToStaticMarkup(
    createElement(EntityDetailPageView, {
      entityInitial: { customColumns: [], entity: { id: "contact-1" } } as never,
      entityType: EntityType.contact,
      id: "contact-1",
      personalizationInitial: {
        columnWidths: { "panel:details-notes:details": 400 },
        p13nId: "contact-detail",
      } as never,
      timelineInitial: {
        availableSources: [],
        items: [],
        pageLimitReached: false,
        scopeTruncated: false,
      } as never,
    }),
  );

  return harness.layoutProps.mock.calls.at(-1)?.[0] as {
    panelLayout: { initial?: Record<string, number>; p13nId?: string; persistenceScope: string };
  };
}

describe("EntityDetailPageView panel persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.appMode = "cloud";
  });

  it("persists resized panel widths outside demo mode", () => {
    expect(renderPage().panelLayout).toEqual({
      initial: { "panel:details-notes:details": 400 },
      p13nId: "contact-detail",
      persistenceScope: "user-1",
    });
  });

  it("keeps demo resizing local without attempting a blocked personalization write", () => {
    harness.appMode = "demo";

    expect(renderPage().panelLayout).toEqual({
      initial: { "panel:details-notes:details": 400 },
      p13nId: undefined,
      persistenceScope: "user-1",
    });
  });
});
