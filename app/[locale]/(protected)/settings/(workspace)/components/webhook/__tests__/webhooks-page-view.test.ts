import type { ReactElement, ReactNode } from "react";
import type { RootStore } from "@/core/stores/root.store";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ViewMode } from "@/core/base/base-query-builder";

const harness = vi.hoisted(() => ({
  contentProps: vi.fn(),
  root: undefined as unknown,
  actions: {
    deleteWebhookAction: vi.fn(),
    upsertWebhookAction: vi.fn(),
    getRecordModelAction: vi.fn(),
  },
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/app/components/topbar-actions-context", () => ({ useSetTopBarActions: vi.fn() }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.root }));
vi.mock("@/components/data-view/use-data-view-sync", () => ({ useDataViewSync: vi.fn() }));
vi.mock("@/components/data-view/data-view-layout", () => ({
  DataViewLayout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/data-view/data-view-content", () => ({
  DataViewContent: (props: Record<string, unknown>) => {
    harness.contentProps(props);
    return null;
  },
}));
vi.mock("../use-webhook-columns", () => ({ useWebhookColumns: () => [] }));
vi.mock("../../../actions", () => harness.actions);
vi.mock("@/app/[locale]/(protected)/records/actions", () => harness.actions);

import { DeleteConfirmationModalStore } from "@/components/modal/delete-confirmation-modal.store";
import { WebhookModalStore } from "../webhook-modal.store";
import { WebhooksPageView } from "../webhooks-page-view";

const MEMBER_ID = "30000000-0000-4000-8000-000000000002";
const OTHER_MEMBER_ID = "30000000-0000-4000-8000-000000000003";

type Member = { id: string; role: { isSystemRole: boolean } };
type Root = {
  deleteConfirmationModalStore: DeleteConfirmationModalStore;
  webhookModalStore: WebhookModalStore;
  webhooksStore: { removeItem: ReturnType<typeof vi.fn> };
};
type Webhook = ReturnType<typeof webhook>;

function webhook(recordOwnerUserId: string | null = null) {
  return {
    id: "30000000-0000-4000-8000-000000000001",
    url: "https://hooks.example.com/customermates",
    description: null,
    events: ["record.created"],
    secret: null,
    headers: null,
    bodyTemplate: null,
    enabled: true,
    pausedReason: null,
    recordTrigger: null,
    recordSources: null,
    recordOwnerUserId,
    createdAt: new Date("2026-10-01T08:00:00.000Z"),
    updatedAt: new Date("2026-10-01T08:00:00.000Z"),
  };
}

function render(member: Member, item: Webhook, canDelete = true): Root {
  const items = [item];
  const root: Record<string, unknown> = {
    registerModalStore: vi.fn(),
    localeStore: { getTranslation: (key: string) => key },
    trashStore: { announceMovedToTrash: vi.fn() },
    userStore: { user: member, can: () => canDelete },
    webhooksStore: {
      canBoard: false,
      dataRequest: { status: "ready" },
      filters: [],
      isGrouped: false,
      items,
      pagination: { page: 1, pageSize: 25, total: items.length, totalPages: 1 },
      removeItem: vi.fn(),
      searchTerm: "",
      setQueryOptions: vi.fn(),
      viewMode: ViewMode.table,
    },
  };
  root.webhookModalStore = new WebhookModalStore(root as unknown as RootStore);
  root.deleteConfirmationModalStore = new DeleteConfirmationModalStore(root as unknown as RootStore);
  harness.root = root;
  renderToStaticMarkup(createElement(WebhooksPageView, { initialWebhooks: { items } as never }));
  return root as unknown as Root;
}

function rowDelete(item: Webhook) {
  const { rowActions } = harness.contentProps.mock.lastCall?.[0] as {
    rowActions: (value: Webhook) => ReactElement<{ onDelete?: () => unknown }>;
  };
  return rowActions(item).props.onDelete;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("webhook row Delete", () => {
  it("asks for confirmation alone, without opening the webhook editor underneath it", async () => {
    const item = webhook();
    const root = render({ id: MEMBER_ID, role: { isSystemRole: false } }, item);
    harness.actions.deleteWebhookAction.mockResolvedValue({ ok: true, data: item.id });

    rowDelete(item)?.();

    expect(root.deleteConfirmationModalStore.isOpen).toBe(true);
    expect(root.webhookModalStore.isOpen).toBe(false);

    await root.deleteConfirmationModalStore.onSubmit();

    expect(harness.actions.deleteWebhookAction).toHaveBeenCalledExactlyOnceWith({ id: item.id });
    expect(root.webhooksStore.removeItem).toHaveBeenCalledExactlyOnceWith(item.id);
    expect(root.deleteConfirmationModalStore.isOpen).toBe(false);
    expect(root.webhookModalStore.isOpen).toBe(false);
  });

  it("closes the confirmation on Cancel without deleting or opening anything", () => {
    const item = webhook();
    const root = render({ id: MEMBER_ID, role: { isSystemRole: false } }, item);

    rowDelete(item)?.();
    root.deleteConfirmationModalStore.close();

    expect(harness.actions.deleteWebhookAction).not.toHaveBeenCalled();
    expect(root.deleteConfirmationModalStore.isOpen).toBe(false);
    expect(root.webhookModalStore.isOpen).toBe(false);
  });

  it.each([
    ["a webhook without record events", { id: MEMBER_ID, role: { isSystemRole: false } }, null, true],
    ["the member's own record webhook", { id: MEMBER_ID, role: { isSystemRole: false } }, MEMBER_ID, true],
    ["another member's record webhook", { id: MEMBER_ID, role: { isSystemRole: false } }, OTHER_MEMBER_ID, false],
    [
      "another member's record webhook for an administrator",
      { id: MEMBER_ID, role: { isSystemRole: true } },
      OTHER_MEMBER_ID,
      true,
    ],
  ])("offers Delete on %s only when the member may delete it", (_label, member, recordOwnerUserId, offered) => {
    const item = webhook(recordOwnerUserId);
    render(member, item);

    expect(Boolean(rowDelete(item))).toBe(offered);
  });

  it("offers no Delete without the delete permission", () => {
    const item = webhook();
    render({ id: MEMBER_ID, role: { isSystemRole: false } }, item, false);

    expect(rowDelete(item)).toBeUndefined();
  });
});
