import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  consoleEnabled: true,
  visibility: vi.fn(() => Promise.resolve(true)),
}));

const NOINDEX = { follow: false, index: false, noarchive: true, nosnippet: true };

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock("@/core/di", () => ({
  getHostedAiOperatorOverviewInteractor: () => ({ invoke: vi.fn() }),
  getOperatorConsoleVisibilityInteractor: () => ({ invoke: state.visibility }),
  getOperatorUserSummaryInteractor: () => ({ invoke: vi.fn() }),
  listOperatorAuditEventsInteractor: () => ({ invoke: vi.fn() }),
  listOperatorUsersInteractor: () => ({ invoke: vi.fn() }),
}));
vi.mock("@/env", () => ({
  env: {
    get HOSTED_AI_OPERATOR_CONTROLS_ENABLED() {
      return true;
    },
    get OPERATOR_CONSOLE_ENABLED() {
      return state.consoleEnabled;
    },
  },
}));
vi.mock("../users/operator-users-console", () => ({ OperatorUsersConsole: () => null }));
vi.mock("../hosted-ai/operator-console", () => ({ HostedAiOperatorConsole: () => null }));

import { generateMetadata as hostedAiMetadata } from "../hosted-ai/page";
import { generateMetadata as usersMetadata } from "../users/page";

beforeEach(() => {
  state.consoleEnabled = true;
  state.visibility.mockClear();
  state.visibility.mockResolvedValue(true);
});

describe("operator page metadata boundary", () => {
  it("keeps the operator title out of the document for a user who is not an eligible operator", async () => {
    state.visibility.mockResolvedValue(false);

    for (const metadata of [usersMetadata, hostedAiMetadata]) {
      const resolved = await metadata();

      expect(resolved.title).toBeUndefined();
      expect(resolved.description).toBeUndefined();
      expect(resolved.robots).toEqual(NOINDEX);
    }
  });

  it("keeps the operator title out of the document while the console flag is disabled", async () => {
    state.consoleEnabled = false;

    for (const metadata of [usersMetadata, hostedAiMetadata]) expect((await metadata()).title).toBeUndefined();

    expect(state.visibility).not.toHaveBeenCalled();
  });

  it("exposes the localized operator title once the persisted access check passes", async () => {
    expect((await usersMetadata()).title).toBe("OperatorUsers.title");
    expect((await hostedAiMetadata()).title).toBe("OperatorConsole.title");
    expect(state.visibility).toHaveBeenCalledTimes(2);
  });
});
