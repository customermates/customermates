import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  protectedEnhancementsAllowed: false,
  closeAllModals: vi.fn(),
  getGlobalSearchStore: vi.fn(),
  openGlobalSearch: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/legal-update" }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    closeAllModals: state.closeAllModals,
    get globalSearchModalStore() {
      state.getGlobalSearchStore();
      return { open: state.openGlobalSearch };
    },
  }),
}));
vi.mock("@/app/components/navigation/protected-enhancements-context", () => ({
  useProtectedEnhancementsAllowed: () => state.protectedEnhancementsAllowed,
}));

vi.mock("../company/components/feedback/feedback-modal", () => ({
  FeedbackModal: () => "feedback-modal",
}));
vi.mock("../company/components/user/user-modal", () => ({
  CompanyUserModal: () => "company-user-modal",
}));
vi.mock("../company/components/company-invite/company-invite-modal", () => ({
  CompanyInviteModal: () => "company-invite-modal",
}));
vi.mock("../company/components/audit-log/audit-log-modal", () => ({
  AuditLogModal: () => "audit-log-modal",
}));
vi.mock("../company/components/webhook/webhook-delivery-modal", () => ({
  WebhookDeliveryModal: () => "webhook-delivery-modal",
}));
vi.mock("../company/components/webhook/webhook-modal", () => ({
  WebhookModal: () => "webhook-modal",
}));
vi.mock("../profile/components/api-key-modal", () => ({
  ApiKeyModal: () => "api-key-modal",
}));
vi.mock("../profile/components/connected-account-modal", () => ({
  ConnectedAccountModal: () => "connected-account-modal",
}));
vi.mock("../profile/components/connect-upsell-modal", () => ({
  ConnectUpsellModal: () => "upsell-modal",
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => "toaster" }));
vi.mock("@/app/components/global-search-modal", () => ({
  GlobalSearchModal: () => "global-search-modal",
}));
vi.mock("@/components/entity-detail/entity-drawer", () => ({
  EntityDrawer: () => "entity-drawer",
}));
vi.mock("@/components/shared/loading-overlay", () => ({
  LoadingOverlay: () => "loading-overlay",
}));
vi.mock("@/components/modal/delete-confirmation-modal", () => ({
  DeleteConfirmationModal: () => "delete-confirmation-modal",
}));
vi.mock("@/components/modal/navigation-guard-modal", () => ({
  NavigationGuardModal: () => "navigation-guard-modal",
}));
vi.mock("@/components/shared/unexpected-error-toaster", () => ({
  UnexpectedErrorToaster: () => "unexpected-error-toaster",
}));
vi.mock("@/components/shared/translation-sync", () => ({
  TranslationSync: () => "translation-sync",
}));
vi.mock("@/components/data-view/custom-columns/custom-column-modal", () => ({
  CustomColumnModal: () => "custom-column-modal",
}));
vi.mock("@/features/messaging/activities/activities-detail-modal", () => ({
  TimelineDetailModal: () => "timeline-detail-modal",
}));

import ProtectedLayout from "../layout";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  state.protectedEnhancementsAllowed = false;
  state.closeAllModals.mockClear();
  state.getGlobalSearchStore.mockClear();
  state.openGlobalSearch.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderLayout() {
  act(() => {
    root.render(createElement(ProtectedLayout, null, "recovery-card"));
  });
}

describe("ProtectedLayout account-state boundary", () => {
  it("mounts only recovery-safe infrastructure and no Cmd+K listener when restricted", () => {
    renderLayout();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));

    expect(container.textContent).toContain("recovery-card");
    expect(container.textContent).toContain("toaster");
    expect(container.textContent).toContain("loading-overlay");
    expect(container.textContent).toContain("unexpected-error-toaster");
    expect(container.textContent).toContain("translation-sync");
    expect(container.textContent).not.toContain("global-search-modal");
    expect(container.textContent).not.toContain("company-user-modal");
    expect(container.textContent).not.toContain("entity-drawer");
    expect(state.getGlobalSearchStore).not.toHaveBeenCalled();
    expect(state.openGlobalSearch).not.toHaveBeenCalled();
  });

  it("mounts tenant enhancements and enables Cmd+K only for the allowed app shell", () => {
    state.protectedEnhancementsAllowed = true;
    renderLayout();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));

    expect(container.textContent).toContain("global-search-modal");
    expect(container.textContent).toContain("company-user-modal");
    expect(container.textContent).toContain("entity-drawer");
    expect(state.getGlobalSearchStore).toHaveBeenCalledOnce();
    expect(state.openGlobalSearch).toHaveBeenCalledOnce();
  });
});
