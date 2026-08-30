import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  visibility: vi.fn(() => Promise.resolve(true)),
}));

const NOINDEX = { follow: false, index: false, noarchive: true, nosnippet: true };

vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getFormatter: () => Promise.resolve({ number: (value: number) => String(value) }),
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock("@/core/di", () => ({
  getHostedAiOperatorOverviewInteractor: () => ({ invoke: vi.fn() }),
  getOperatorAuditListInteractor: () => ({ invoke: vi.fn() }),
  getOperatorConsoleVisibilityInteractor: () => ({ invoke: state.visibility }),
  getOperatorRiskSummaryInteractor: () => ({ invoke: vi.fn() }),
  getOperatorUserSummaryInteractor: () => ({ invoke: vi.fn() }),
  getOperatorUsersListInteractor: () => ({ invoke: vi.fn() }),
  getOperatorWorkspacesListInteractor: () => ({ invoke: vi.fn() }),
}));
vi.mock("@/env", () => ({
  env: {
    get HOSTED_AI_OPERATOR_CONTROLS_ENABLED() {
      return true;
    },
  },
}));
vi.mock("../users/operator-users-page-view", () => ({ OperatorUsersPageView: () => null }));
vi.mock("../workspaces/operator-workspaces-page-view", () => ({ OperatorWorkspacesPageView: () => null }));
vi.mock("../audit/operator-audit-page-view", () => ({ OperatorAuditPageView: () => null }));
vi.mock("../settings/operator-settings-view", () => ({ OperatorSettingsView: () => null }));

import { generateMetadata as auditMetadata } from "../audit/page";
import { generateMetadata as overviewMetadata } from "../overview/page";
import { generateMetadata as settingsMetadata } from "../settings/page";
import { generateMetadata as usersMetadata } from "../users/page";
import { generateMetadata as workspacesMetadata } from "../workspaces/page";

const pages = [
  ["users", usersMetadata, "OperatorUsers.title"],
  ["workspaces", workspacesMetadata, "OperatorWorkspaces.title"],
  ["audit", auditMetadata, "OperatorAudit.title"],
  ["overview", overviewMetadata, "OperatorOverview.title"],
  ["settings", settingsMetadata, "OperatorSettings.title"],
] as const;

beforeEach(() => {
  state.visibility.mockClear();
  state.visibility.mockResolvedValue(true);
});

describe("operator page metadata boundary", () => {
  it.each(pages)("keeps the %s title out of the document for an ineligible user", async (_name, metadata) => {
    state.visibility.mockResolvedValue(false);

    const resolved = await metadata();

    expect(resolved.title).toBeUndefined();
    expect(resolved.description).toBeUndefined();
    expect(resolved.robots).toEqual(NOINDEX);
  });

  it.each(pages)("exposes the %s title once the persisted access check passes", async (_name, metadata, title) => {
    expect((await metadata()).title).toBe(title);
    expect(state.visibility).toHaveBeenCalledTimes(1);
  });
});
