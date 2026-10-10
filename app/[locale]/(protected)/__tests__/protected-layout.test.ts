import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/legal-update",
  protectedEnhancementsAllowed: false,
  agentChatEnabled: false,
  agentConfigEnabled: null as boolean | null,
  agentOpen: false,
  closeAllModals: vi.fn(),
  getGlobalSearchStore: vi.fn(),
  getAgentChatStore: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    agentChatEnabled: state.agentChatEnabled,
    closeAllModals: state.closeAllModals,
    recordWorkspaceStore: { routeReady: () => true },
    get globalSearchModalStore() {
      state.getGlobalSearchStore();
      return {};
    },
    get agentChatStore() {
      state.getAgentChatStore();
      return { enabled: state.agentConfigEnabled, isOpen: state.agentOpen };
    },
  }),
}));
vi.mock("@/app/components/navigation/protected-enhancements-context", () => ({
  useProtectedEnhancementsAllowed: () => state.protectedEnhancementsAllowed,
}));

vi.mock("../settings/(workspace)/components/feedback/feedback-modal", () => ({
  FeedbackModal: () => "feedback-modal",
}));
vi.mock("../settings/(workspace)/components/user/user-modal", () => ({
  CompanyUserModal: () => "company-user-modal",
}));
vi.mock("../settings/(workspace)/components/company-invite/company-invite-modal", () => ({
  CompanyInviteModal: () => "company-invite-modal",
}));
vi.mock("../settings/(workspace)/components/webhook/webhook-delivery-modal", () => ({
  WebhookDeliveryModal: () => "webhook-delivery-modal",
}));
vi.mock("../routines/components/routine-modal", () => ({
  RoutineModal: () => "routine-modal",
}));
vi.mock("../settings/(workspace)/components/webhook/webhook-modal", () => ({
  WebhookModal: () => "webhook-modal",
}));
vi.mock("../settings/(account)/components/api-key-modal", () => ({
  ApiKeyModal: () => "api-key-modal",
}));
vi.mock("../settings/(account)/components/connected-account-modal", () => ({
  ConnectedAccountModal: () => "connected-account-modal",
}));
vi.mock("../settings/(account)/components/connect-upsell-modal", () => ({
  ConnectUpsellModal: () => "upsell-modal",
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => "toaster" }));
vi.mock("@/app/components/global-search-modal", () => ({
  GlobalSearchModal: () => "global-search-modal",
}));
vi.mock("@/components/records/workspace-record-editor", () => ({
  WorkspaceRecordEditor: () => "workspace-record-editor",
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
vi.mock("@/app/components/keyboard-shortcuts/global-keyboard-shortcuts", () => ({
  GlobalKeyboardShortcuts: () => "global-keyboard-shortcuts",
}));
vi.mock("@/app/components/keyboard-shortcuts/keyboard-shortcuts-dialog", () => ({
  KeyboardShortcutsDialog: () => "keyboard-shortcuts-dialog",
}));
vi.mock("@/components/data-view/views/view-picker", () => ({
  ViewPicker: () => "view-picker",
}));
vi.mock("@/app/components/agent-chat/agent-chat", () => ({
  AgentChat: () => "agent-chat",
}));
vi.mock("@/features/messaging/activities/activities-detail-modal", () => ({
  TimelineDetailModal: () => "timeline-detail-modal",
}));

import { ProtectedShell as ProtectedLayout } from "../protected-shell";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  state.pathname = "/legal-update";
  state.protectedEnhancementsAllowed = false;
  state.agentChatEnabled = false;
  state.agentConfigEnabled = null;
  state.agentOpen = false;
  state.pathname = "/legal-update";
  state.closeAllModals.mockClear();
  state.getGlobalSearchStore.mockClear();
  state.getAgentChatStore.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderLayout() {
  await act(async () => {
    root.render(createElement(ProtectedLayout, null, "recovery-card"));
    await Promise.resolve();
  });
}

describe("ProtectedLayout account-state boundary", () => {
  it("retains a modal opened during hydration and closes it when the route or access changes", async () => {
    state.protectedEnhancementsAllowed = true;
    state.pathname = "/records/projects";
    await renderLayout();
    expect(state.closeAllModals).not.toHaveBeenCalled();
    state.pathname = "/configure";
    await renderLayout();
    expect(state.closeAllModals).toHaveBeenCalledOnce();
    state.protectedEnhancementsAllowed = false;
    await renderLayout();
    expect(state.closeAllModals).toHaveBeenCalledTimes(2);
  });
  it("mounts only recovery-safe infrastructure without assistant store access when restricted", async () => {
    state.agentChatEnabled = true;
    state.agentConfigEnabled = true;
    await renderLayout();

    expect(container.textContent).toContain("recovery-card");
    expect(container.textContent).toContain("toaster");
    expect(container.textContent).toContain("loading-overlay");
    expect(container.textContent).toContain("unexpected-error-toaster");
    expect(container.textContent).toContain("translation-sync");
    expect(container.textContent).not.toContain("global-keyboard-shortcuts");
    expect(container.textContent).not.toContain("keyboard-shortcuts-dialog");
    expect(container.textContent).not.toContain("global-search-modal");
    expect(container.textContent).not.toContain("company-user-modal");
    expect(container.textContent).not.toContain("routine-modal");
    expect(container.textContent).not.toContain("import-wizard");
    expect(container.textContent).not.toContain("agent-chat");
    expect(state.getGlobalSearchStore).not.toHaveBeenCalled();
    expect(state.getAgentChatStore).not.toHaveBeenCalled();
  });

  it("mounts tenant enhancements and the keyboard shortcuts but not the assistant when its process gate is off", async () => {
    state.protectedEnhancementsAllowed = true;
    await renderLayout();

    expect(container.textContent).toContain("global-keyboard-shortcuts");
    expect(container.textContent).toContain("keyboard-shortcuts-dialog");
    expect(container.textContent).toContain("global-search-modal");
    expect(container.textContent).toContain("company-user-modal");
    expect(container.textContent).toContain("routine-modal");
    expect(container.textContent).not.toContain("import-wizard");
    expect(container.textContent).not.toContain("agent-chat");
    expect(state.getAgentChatStore).not.toHaveBeenCalled();
  });

  it("mounts the assistant when its process gate is on", async () => {
    state.protectedEnhancementsAllowed = true;
    state.agentChatEnabled = true;
    await renderLayout();

    expect(container.textContent).toContain("agent-chat");
  });
});
