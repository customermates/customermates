import type { ReactElement, ReactNode } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { IncomingWebhookDto } from "@/features/incoming-webhook/incoming-webhook.schema";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ViewMode } from "@/core/base/base-query-builder";

const harness = vi.hoisted(() => ({
  contentProps: vi.fn(),
  root: undefined as unknown,
  actions: {
    manageIncomingWebhookAction: vi.fn(),
    getIncomingWebhooksAction: vi.fn(),
  },
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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
vi.mock("../use-incoming-webhook-columns", () => ({ useIncomingWebhookColumns: () => [] }));
vi.mock("../incoming-webhook-modal", () => ({ IncomingWebhookModal: () => null }));
vi.mock("../incoming-webhook-deliveries", () => ({ IncomingWebhookDeliveries: () => null }));
vi.mock("../incoming-webhook-actions", () => harness.actions);

import { DeleteConfirmationModalStore } from "@/components/modal/delete-confirmation-modal.store";
import { IncomingWebhookModalStore } from "../incoming-webhook-modal.store";
import { IncomingWebhooksPageView } from "../incoming-webhooks-page-view";

const LISTS = [{ id: "10000000-0000-4000-8000-000000000001", label: "Leads" }];

type Root = {
  deleteConfirmationModalStore: DeleteConfirmationModalStore;
  incomingWebhookModalStore: IncomingWebhookModalStore;
  incomingWebhooksStore: { removeItem: ReturnType<typeof vi.fn> };
};

function webhook(): IncomingWebhookDto {
  return {
    id: "30000000-0000-4000-8000-000000000001",
    typeId: LISTS[0].id,
    name: "Typeform",
    enabled: true,
    url: "https://app.example.test/api/hooks/secret",
    hasSigningSecret: false,
    signatureHeader: "x-signature",
    mapping: { mode: "create", matchFieldId: null, fields: [{ path: "a", fieldId: "20000000-0000-4000-8000-000000000001" }] },
    samplePayload: null,
    lastReceivedAt: null,
    createdAt: "2026-11-01T08:00:00.000Z",
    updatedAt: "2026-11-01T08:00:00.000Z",
  };
}

function render(item: IncomingWebhookDto, options: { canDelete?: boolean; lists?: typeof LISTS } = {}): Root {
  const items = [item];
  const root: Record<string, unknown> = {
    registerModalStore: vi.fn(),
    localeStore: { getTranslation: (key: string) => key },
    trashStore: { announceMovedToTrash: vi.fn() },
    userStore: { user: { id: "u", role: { isSystemRole: false } }, can: () => options.canDelete ?? true },
    incomingWebhooksStore: {
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
  root.incomingWebhookModalStore = new IncomingWebhookModalStore(root as unknown as RootStore);
  root.deleteConfirmationModalStore = new DeleteConfirmationModalStore(root as unknown as RootStore);
  harness.root = root;
  renderToStaticMarkup(
    createElement(IncomingWebhooksPageView, {
      initialWebhooks: { items } as never,
      lists: options.lists ?? LISTS,
    }),
  );
  return root as unknown as Root;
}

function contentProps() {
  return harness.contentProps.mock.lastCall?.[0] as {
    rowActions: (value: IncomingWebhookDto) => ReactElement<{ onDelete?: () => unknown; onOpen: () => void }>;
    onRowClick: (value: IncomingWebhookDto) => void;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("incoming webhooks page", () => {
  it("opens the editor on the clicked endpoint", () => {
    const item = webhook();
    const root = render(item);

    contentProps().onRowClick(item);

    expect(root.incomingWebhookModalStore.isOpen).toBe(true);
    expect(root.incomingWebhookModalStore.form.id).toBe(item.id);
  });

  it("asks for confirmation on Delete without opening the editor, then deletes and removes the row", async () => {
    const item = webhook();
    const root = render(item);
    harness.actions.manageIncomingWebhookAction.mockResolvedValue({ ok: true, data: { deleted: true } });

    contentProps().rowActions(item).props.onDelete?.();

    expect(root.deleteConfirmationModalStore.isOpen).toBe(true);
    expect(root.incomingWebhookModalStore.isOpen).toBe(false);

    await root.deleteConfirmationModalStore.onSubmit();

    expect(harness.actions.manageIncomingWebhookAction).toHaveBeenCalledExactlyOnceWith({
      action: "delete",
      id: item.id,
    });
    expect(root.incomingWebhooksStore.removeItem).toHaveBeenCalledExactlyOnceWith(item.id);
    expect(root.incomingWebhookModalStore.isOpen).toBe(false);
  });

  it("offers no Delete without the delete permission", () => {
    const item = webhook();
    render(item, { canDelete: false });

    expect(contentProps().rowActions(item).props.onDelete).toBeUndefined();
  });
});
