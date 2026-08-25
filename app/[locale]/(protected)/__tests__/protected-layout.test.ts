import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  protectedEnhancementsAllowed: false,
  agentChatEnabled: false,
  agentConfigEnabled: null as boolean | null,
  closeAllModals: vi.fn(),
  getGlobalSearchStore: vi.fn(),
  getAgentChatStore: vi.fn(),
  openGlobalSearch: vi.fn(),
  openAgentChat: vi.fn(),
  closeAgentChat: vi.fn(),
  agentChatOpen: false,
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/legal-update" }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    agentChatEnabled: state.agentChatEnabled,
    closeAllModals: state.closeAllModals,
    get globalSearchModalStore() {
      state.getGlobalSearchStore();
      return { open: state.openGlobalSearch };
    },
    get agentChatStore() {
      state.getAgentChatStore();
      return {
        enabled: state.agentConfigEnabled,
        isOpen: state.agentChatOpen,
        open: state.openAgentChat,
        close: state.closeAgentChat,
      };
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
vi.mock("@/app/components/agent-chat/agent-chat", () => ({
  AgentChat: () => "agent-chat",
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
  state.agentChatEnabled = false;
  state.agentConfigEnabled = null;
  state.closeAllModals.mockClear();
  state.getGlobalSearchStore.mockClear();
  state.getAgentChatStore.mockClear();
  state.openGlobalSearch.mockClear();
  state.openAgentChat.mockClear();
  state.closeAgentChat.mockClear();
  state.agentChatOpen = false;
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
  it("mounts only recovery-safe infrastructure without assistant store access when restricted", () => {
    state.agentChatEnabled = true;
    state.agentConfigEnabled = true;
    renderLayout();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", metaKey: true, bubbles: true }));

    expect(container.textContent).toContain("recovery-card");
    expect(container.textContent).toContain("toaster");
    expect(container.textContent).toContain("loading-overlay");
    expect(container.textContent).toContain("unexpected-error-toaster");
    expect(container.textContent).toContain("translation-sync");
    expect(container.textContent).not.toContain("global-search-modal");
    expect(container.textContent).not.toContain("company-user-modal");
    expect(container.textContent).not.toContain("entity-drawer");
    expect(container.textContent).not.toContain("agent-chat");
    expect(state.getGlobalSearchStore).not.toHaveBeenCalled();
    expect(state.getAgentChatStore).not.toHaveBeenCalled();
    expect(state.openGlobalSearch).not.toHaveBeenCalled();
    expect(state.openAgentChat).not.toHaveBeenCalled();
  });

  it("mounts tenant enhancements but not the assistant when its process gate is off", () => {
    state.protectedEnhancementsAllowed = true;
    renderLayout();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", metaKey: true, bubbles: true }));

    expect(container.textContent).toContain("global-search-modal");
    expect(container.textContent).toContain("company-user-modal");
    expect(container.textContent).toContain("entity-drawer");
    expect(container.textContent).not.toContain("agent-chat");
    expect(state.getGlobalSearchStore).toHaveBeenCalledOnce();
    expect(state.getAgentChatStore).not.toHaveBeenCalled();
    expect(state.openGlobalSearch).toHaveBeenCalledOnce();
    expect(state.openAgentChat).not.toHaveBeenCalled();
  });

  it("mounts the assistant but ignores Cmd+J while its config is unresolved", () => {
    state.protectedEnhancementsAllowed = true;
    state.agentChatEnabled = true;
    renderLayout();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true }));

    expect(container.textContent).toContain("agent-chat");
    expect(state.getAgentChatStore).toHaveBeenCalledOnce();
    expect(state.openAgentChat).not.toHaveBeenCalled();
  });

  it("opens the available assistant with Cmd+J", () => {
    state.protectedEnhancementsAllowed = true;
    state.agentChatEnabled = true;
    state.agentConfigEnabled = true;
    renderLayout();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", metaKey: true, bubbles: true }));

    expect(container.textContent).toContain("agent-chat");
    expect(state.getAgentChatStore).toHaveBeenCalledOnce();
    expect(state.openAgentChat).toHaveBeenCalledOnce();
    expect(state.closeAgentChat).not.toHaveBeenCalled();
  });

  it("closes the assistant when Cmd+J is pressed again", () => {
    state.protectedEnhancementsAllowed = true;
    state.agentChatEnabled = true;
    state.agentConfigEnabled = true;
    state.agentChatOpen = true;
    renderLayout();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", metaKey: true, bubbles: true }));

    expect(state.closeAgentChat).toHaveBeenCalledOnce();
    expect(state.openAgentChat).not.toHaveBeenCalled();
  });
});
