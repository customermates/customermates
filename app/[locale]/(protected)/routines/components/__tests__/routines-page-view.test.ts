import type { ReactElement } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewMode } from "@/core/base/base-query-builder";

const harness = vi.hoisted(() => ({
  getRootStore: vi.fn(),
  openForCreate: vi.fn(),
  openWithDraft: vi.fn(),
  setTopBarActions: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/routines" }));
vi.mock("@/app/components/topbar-actions-context", () => ({
  useSetTopBarActions: harness.setTopBarActions,
}));
vi.mock("@/app/components/agent-chat/suggested-questions", () => ({
  AgentStarterActions: ({ pageId, state }: { pageId: string; state: string }) =>
    createElement("div", { "data-page-id": pageId, "data-page-state": state }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: harness.getRootStore,
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ map: () => ({}) }),
}));
vi.mock("@/components/data-view/use-data-view-sync", () => ({
  useDataViewSync: vi.fn(),
}));
vi.mock("@/components/data-view/header/display-options", () => ({
  DataViewDisplayOptions: () => null,
}));
vi.mock("@/components/data-view/header/filter-popover", () => ({
  FilterPopover: () => null,
}));
vi.mock("@/components/data-view/header/search", () => ({
  DataViewSearch: () => null,
}));
vi.mock("@/components/data-view/data-view-layout", () => ({
  DataViewLayout: ({ children }: { children: ReactElement }) => createElement("div", null, children),
}));
vi.mock("../routines-page-skeleton", () => ({
  RoutinesPageSkeleton: () => createElement("div", { "data-routines-skeleton": true }),
}));
vi.mock("../use-routine-columns", () => ({ useRoutineColumns: () => [] }));

import { RoutinesPageView } from "../routines-page-view";

beforeEach(() => {
  vi.clearAllMocks();
  harness.getRootStore.mockReturnValue({
    agentChatStore: {
      enabled: true,
      openWithDraft: harness.openWithDraft,
      usage: { blockedReason: null },
    },
    routineModalStore: { openForCreate: harness.openForCreate },
    routinesStore: {
      canBoard: false,
      canManage: true,
      dataRequest: { status: "ready" },
      filters: [],
      isGrouped: false,
      items: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      searchTerm: "",
      setQueryOptions: vi.fn(),
      viewMode: ViewMode.table,
    },
    userStore: { can: () => true },
  });
});

describe("RoutinesPageView", () => {
  it("renders the page-specific starter actions in the true empty state", () => {
    const initialRoutines = {
      items: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    };
    const html = renderToStaticMarkup(createElement(RoutinesPageView, { initialRoutines } as never));

    expect(html).toContain('data-page-id="routines"');
    expect(html).toContain('data-page-state="empty"');
  });
});
