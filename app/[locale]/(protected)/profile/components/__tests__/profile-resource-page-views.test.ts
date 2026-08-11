import type { ReactElement } from "react";
import type { PageStateProps } from "@/components/page-state/page-state";
import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { ApiKey } from "@/features/api-key/get-api-keys.interactor";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectedAccountStatus, MessagingProvider } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  addApiKey: vi.fn(),
  canConnect: true,
  connectAccount: vi.fn(),
  getRootStore: vi.fn(),
  openAccount: vi.fn(),
  pageStateProps: vi.fn(),
  refreshAccounts: vi.fn(),
  refreshApiKeys: vi.fn(),
  setTopBarActions: vi.fn(),
  startPolling: vi.fn(),
  stopPolling: vi.fn(),
  viewApiKey: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, {
      rich: (key: string) => key,
    }),
}));

vi.mock("@/app/components/topbar-actions-context", () => ({
  useSetTopBarActions: harness.setTopBarActions,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: harness.getRootStore,
}));

vi.mock("@/ee/messaging/provider-icon", () => ({
  getProviderIcon: () => (props: Record<string, unknown>) => createElement("span", props),
}));

vi.mock("@/components/shared/avatar-stack", () => ({
  AvatarStack: () => createElement("div", { "data-avatar-stack": true }),
}));

vi.mock("../account-status-color", () => ({
  accountStatusChipColor: () => "success",
  getProviderDisplayLabel: () => "Provider",
}));

vi.mock("@/components/page-state/page-state", async (importOriginal) => {
  const React = await import("react");
  const actual = await importOriginal<{ PageState: (props: PageStateProps) => ReactElement }>();

  return {
    ...actual,
    PageState: (props: Parameters<typeof actual.PageState>[0]) => {
      harness.pageStateProps(props);
      return React.createElement(actual.PageState, props);
    },
  };
});

import { ApiKeysPageView } from "../api-keys-page-view";
import { ConnectedAccountsPageView } from "../connected-accounts-page-view";

type RequestStatus = "uninitialized" | "ready" | "refreshing" | "refresh-error";

function request(status: RequestStatus) {
  return status === "refresh-error" ? { status, error: new Error("failed") } : { status };
}

function apiKey(): ApiKey {
  return {
    id: "api-1",
    name: "Integration",
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    expiresAt: null,
    lastRequest: null,
  };
}

function connectedAccount(): ConnectedAccountDto {
  return {
    id: "03f07663-3ddb-4b33-bf31-6b00f25a5194",
    displayName: "Inbox",
    provider: MessagingProvider.google,
    status: ConnectedAccountStatus.ok,
    syncing: false,
    shared: false,
    hasMessaging: true,
    hasCalendar: false,
    emailAddress: "inbox@example.com",
    isOwner: true,
    folders: [],
    selectedFolderIds: [],
    foldersSyncedAt: null,
    linkedinProducts: [],
    owner: {
      userId: "3d788d03-eb75-4d99-89cc-bc13c7850e4b",
      firstName: "Ava",
      lastName: "Miller",
      avatarUrl: null,
    },
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    lastSyncedAt: null,
  };
}

function renderApiKeys(status: RequestStatus, options: { canManage?: boolean; withItem?: boolean } = {}) {
  const items = options.withItem ? [apiKey()] : [];
  const apiKeysStore = {
    canManage: options.canManage ?? true,
    dataRequest: request(status),
    items,
    refreshQuery: harness.refreshApiKeys,
    setItems: vi.fn(),
  };
  harness.getRootStore.mockReturnValue({
    apiKeyModalStore: { add: harness.addApiKey, view: harness.viewApiKey },
    apiKeysStore,
    intlStore: { formatNumericalShortDateTime: () => "date" },
  });

  return renderToStaticMarkup(createElement(ApiKeysPageView, { apiKeys: items }));
}

function renderConnected(
  status: RequestStatus,
  options: { canConnect?: boolean; locked?: boolean; withItem?: boolean } = {},
) {
  const items = options.withItem ? [connectedAccount()] : [];
  const connectedAccountsStore = {
    connectAccount: harness.connectAccount,
    dataRequest: request(status),
    items,
    refreshQuery: harness.refreshAccounts,
    setItems: vi.fn(),
    startSyncPolling: harness.startPolling,
    stopSyncPolling: harness.stopPolling,
  };
  harness.canConnect = options.canConnect ?? true;
  harness.getRootStore.mockReturnValue({
    connectedAccountModalStore: { openWith: harness.openAccount },
    connectedAccountsStore,
    intlStore: { formatNumericalShortDateTime: () => "date" },
    userStore: { can: () => harness.canConnect },
  });

  return renderToStaticMarkup(
    createElement(ConnectedAccountsPageView, {
      accounts: items,
      locked: options.locked,
    }),
  );
}

function latestTopBar() {
  return harness.setTopBarActions.mock.lastCall?.[0] as ReactElement;
}

describe("profile resource page views", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["api keys", () => renderApiKeys("uninitialized"), 'data-profile-resource-page-skeleton="api-keys"'],
    [
      "connected accounts",
      () => renderConnected("uninitialized"),
      'data-profile-resource-page-skeleton="connected-accounts"',
    ],
  ])("renders an accessible animated loading branch for %s", (_name, render, skeletonMarker) => {
    const html = render();

    expect(html).toContain('data-page-state="loading"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(skeletonMarker);
    expect(html).toContain("data-skeleton-motion");
    expect(html).not.toContain("<button");
  });

  it("renders API-key error retry, true empty, permission gating, and content", () => {
    harness.refreshApiKeys.mockRejectedValue(new Error("failed"));
    const error = renderApiKeys("refresh-error");
    const errorProps = harness.pageStateProps.mock.calls.find(([props]) => props.state === "error")?.[0];
    const retry = errorProps?.action as ReactElement<{ onClick: () => void }>;

    expect(error).toContain('data-page-state="error"');
    retry.props.onClick();
    expect(harness.refreshApiKeys).toHaveBeenCalledTimes(1);

    const empty = renderApiKeys("ready");
    expect(empty).toContain('data-page-state="empty"');
    expect(empty).toContain('data-page-skeleton-empty="true"');
    expect(empty).toContain('data-variant="secondary"');
    expect(renderToStaticMarkup(latestTopBar())).toContain('data-variant="default"');

    const readOnly = renderApiKeys("ready", { canManage: false });
    expect(readOnly).not.toContain("<button");
    expect(renderToStaticMarkup(latestTopBar())).not.toContain("profile-api-keys-generate");

    const content = renderApiKeys("ready", { withItem: true });
    expect(content).toContain("Integration");
    expect(content).toContain("animate-page-result-in");
    expect(content).not.toContain("data-page-state");
  });

  it("renders connected-account locked, error, empty, permission, and content branches", () => {
    const locked = renderConnected("ready", { locked: true });
    expect(locked).toContain('data-page-skeleton-empty="true"');
    expect(locked).not.toContain("profile-connected-accounts-connect");
    expect(latestTopBar()).toBeNull();

    harness.refreshAccounts.mockRejectedValue(new Error("failed"));
    const error = renderConnected("refresh-error");
    const errorProps = harness.pageStateProps.mock.calls.find(([props]) => props.state === "error")?.[0];
    const retry = errorProps?.action as ReactElement<{ onClick: () => void }>;
    expect(error).toContain('data-page-state="error"');
    retry.props.onClick();
    expect(harness.refreshAccounts).toHaveBeenCalledTimes(1);

    const empty = renderConnected("ready");
    expect(empty).toContain('data-page-state="empty"');
    expect(empty).toContain('data-variant="secondary"');
    expect(renderToStaticMarkup(latestTopBar())).toContain('data-variant="default"');

    const readOnly = renderConnected("ready", { canConnect: false });
    expect(readOnly).not.toContain("<button");
    expect(renderToStaticMarkup(latestTopBar())).not.toContain("profile-connected-accounts-connect");

    const content = renderConnected("ready", { withItem: true });
    expect(content).toContain("Inbox");
    expect(content).toContain("animate-page-result-in");
    expect(content).not.toContain("data-page-state");
  });
});
