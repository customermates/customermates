import type { ReactElement, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";

const DEALS = "11111111-1111-4111-8111-111111111111";
const CLOSE = "22222222-2222-4222-8222-333333333333";

const harness = vi.hoisted(() => ({
  toolbar: null as ReactElement<{ automateHref?: string; menuItems: ReactNode }> | null,
  granted: [] as string[],
}));

const nothing = vi.hoisted(() => () => null);

vi.mock("mobx-react-lite", () => ({ observer: <T,>(component: T) => component }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));
vi.mock("@/core/utils/server-rendered-client", () => ({ serverRenderedClient: <T,>(component: T) => component }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    userStore: {
      can: (resource: string, action: string) => harness.granted.includes(`${resource}:${action}`),
      canAccess: (resource: string) => harness.granted.some((grant) => grant.startsWith(`${resource}:`)),
    },
    recordWorkspaceStore: { subscribe: vi.fn(), open: vi.fn(), invalidate: vi.fn() },
    layoutStore: { setRuntimeIdentity: vi.fn(), clearRuntimeIdentity: vi.fn() },
  }),
}));
vi.mock("@/app/components/topbar-actions-context", () => ({
  useSetTopBarActions: (node: ReactElement<{ automateHref?: string; menuItems: ReactNode }>) => {
    harness.toolbar = node;
  },
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, href }: { children: ReactNode; href: string }) => createElement("a", { href }, children),
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenuItem: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/hooks/use-apply-on-change", () => ({ useApplyOnChange: vi.fn() }));
vi.mock("@/hooks/use-client-ready", () => ({ useClientReady: () => false }));
vi.mock("@/components/data-view/use-data-view-sync", () => ({ useDataViewSync: vi.fn() }));
vi.mock("@/components/data-view/data-view-state", () => ({
  resolveDataViewPageState: () => "loading",
  resolveDataViewView: () => "table",
}));
vi.mock("@/components/data-view/data-view-toolbar", () => ({ DataViewToolbar: nothing }));
vi.mock("@/components/data-view/data-view-content", () => ({ DataViewContent: nothing }));
vi.mock("@/components/data-view/data-view-empty", () => ({ DataViewEmpty: nothing }));
vi.mock("@/components/data-view/data-view-layout", () => ({ DataViewLayout: nothing }));
vi.mock("@/components/data-view/row-actions", () => ({ RowActions: nothing }));
vi.mock("@/components/page-state/page-state", () => ({ PageState: nothing }));
vi.mock("@/components/records/use-record-route-ready", () => ({ useRecordRouteReady: vi.fn() }));
vi.mock("@/components/records/record-operation-progress", () => ({ RecordOperationProgress: nothing }));
vi.mock("@/features/data-transfer/export/use-record-export", () => ({ useRecordExport: () => vi.fn() }));
vi.mock("../records-page-skeleton", () => ({ RecordsPageSkeleton: nothing }));
vi.mock("../record-table-columns", () => ({ useRecordCardRenderer: () => nothing, useRecordTableColumns: () => [] }));
vi.mock("../use-record-deletion", () => ({ useRecordDeletion: () => ({ requestDeletion: vi.fn() }) }));
vi.mock("../record-import-dialog", () => ({ RecordImportDialog: nothing }));
vi.mock("../record-calendar-view", () => ({ RecordCalendarView: nothing }));
vi.mock("../record-mass-actions", () => ({ RecordMassActions: nothing }));
vi.mock("../records.store", () => ({
  NUMBER_VALUE_TYPES: [],
  RecordsStore: class {
    type = { pluralLabel: "Deals", primaryFieldId: null };
    recordColumns = [];
    items = [];
    setPresentation = vi.fn();
    constructor(
      _root: unknown,
      readonly presentation: unknown,
    ) {}
  },
}));

import { RecordsPageView } from "../records-page-view";

const presentation = {
  typeId: DEALS,
  result: {},
  permittedActions: [],
  canManageSchema: false,
  model: {
    revision: 1,
    fields: [{ id: CLOSE, typeId: DEALS, archived: false, valueType: "date", label: "Close date" }],
  },
};

function offered(granted: string[]) {
  harness.granted = granted;
  harness.toolbar = null;
  renderToStaticMarkup(createElement(RecordsPageView, { presentation } as never));
  if (!harness.toolbar) throw new Error("the page set no toolbar");
  const menu = renderToStaticMarkup(createElement("div", null, harness.toolbar.props.menuItems));
  return { automateHref: harness.toolbar.props.automateHref, menu };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the automation entries of a list", () => {
  it("offers Automate this list and Remind me about to a member who may create automations", () => {
    const { automateHref, menu } = offered([`${Resource.routines}:${Action.create}`]);

    expect(automateHref).toBe(`/automations?new=${DEALS}`);
    expect(menu).toContain(`/automations?remind=${DEALS}:${CLOSE}`);
    expect(menu).toContain("AutomationRules.remindBefore:Close date");
  });

  it("offers neither to a member who may only read automations", () => {
    const { automateHref, menu } = offered([`${Resource.routines}:${Action.readAll}`]);

    expect(automateHref).toBeUndefined();
    expect(menu).not.toContain("/automations");
  });
});
