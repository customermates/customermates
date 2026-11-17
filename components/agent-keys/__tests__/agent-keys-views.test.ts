import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";
import type { AgentProviderKeyDto } from "@/ee/agent-keys/agent-provider-key.schema";
import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";

const testContext = vi.hoisted(() => ({ rootStore: null as RootStore | null }));

vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => testContext.rootStore }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatNumericalShortDateTime: (date: Date) => `date:${date.toISOString().slice(0, 10)}`,
  }),
}));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showDeleteConfirmation: vi.fn() }),
}));
vi.mock("../agent-key-actions", () => ({
  deleteAgentProviderKeyAction: vi.fn(),
  getAgentJobAction: vi.fn(),
  getAgentJobsAction: vi.fn(),
  refreshAgentProviderKeysAction: vi.fn(),
  saveAgentProviderKeyAction: vi.fn(),
  testAgentProviderKeyAction: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, string | number>) =>
        values
          ? `${key}(${Object.entries(values)
              .map(([name, value]) => `${name}=${value}`)
              .join(",")})`
          : key,
      {},
    ),
}));

import { AgentKeysStore } from "../agent-keys.store";
import { AgentKeysCard } from "../agent-keys-card";
import { AgentRunnersCard } from "../agent-runners-card";
import { agentRuntimeWithKeys } from "../agent-runtime-with-keys";
import { AgentRuntimesCard } from "../agent-runtimes-card";

const KEY: AgentProviderKeyDto = {
  id: "00000000-0000-4000-8000-0000000000a1",
  provider: "anthropic",
  label: "Production",
  last4: "0001",
  defaultModel: "claude-sonnet-5-5",
  validatedAt: "2026-11-17T08:00:00.000Z",
  lastUsedAt: null,
  createdAt: "2026-11-17T07:00:00.000Z",
};

function renderKeys(items: AgentProviderKeyDto[], options: { canManage?: boolean; planAllowed?: boolean } = {}) {
  const rootStore = {
    registerModalStore: vi.fn(),
    localeStore: { getTranslation: (key: string) => key },
    userStore: { user: { id: "user-1" }, can: () => options.canManage ?? true },
    agentKeyModalStore: { add: vi.fn() },
  } as unknown as RootStore;
  const store = new AgentKeysStore(rootStore);
  store.setItems(items);
  testContext.rootStore = { ...rootStore, agentKeysStore: store } as unknown as RootStore;
  return renderToStaticMarkup(createElement(AgentKeysCard, { planAllowed: options.planAllowed ?? true }));
}

function availability(overrides: Partial<AgentRuntimeAvailability> = {}): AgentRuntimeAvailability {
  const none = { models: [], runners: [] };
  return {
    mate: { available: true, reason: null, ...none },
    ownKey: { available: false, reason: "noKey", ...none },
    runner: { available: false, reason: "noRunner", ...none },
    ...overrides,
  };
}

beforeEach(() => {
  testContext.rootStore = null;
});

describe("AgentKeysCard", () => {
  it("lists a key by label, provider and last four characters and never anything more of the key", () => {
    const markup = renderKeys([KEY]);

    expect(markup).toContain('id="agent-keys"');
    expect(markup).toContain("Production");
    expect(markup).toContain("AgentKeys.providers.anthropic");
    expect(markup).toContain("AgentKeys.endsIn(last4=0001)");
    expect(markup).toContain("claude-sonnet-5-5");
    expect(markup).toContain("date:2026-11-17");
    expect(markup).toContain("Common.never");
    expect(markup).toContain('id="agent-key-test-anthropic"');
    expect(markup).toContain('id="agent-key-remove-anthropic"');
    expect(markup).not.toMatch(/sk-|keyCiphertext|v1\./);
  });

  it("says there is no key yet and offers adding one to someone who can change settings", () => {
    const markup = renderKeys([]);

    expect(markup).toContain("AgentKeys.keysEmpty");
    expect(markup).toContain('id="agent-key-add"');
    expect(markup).not.toMatch(/\sdisabled=""/);
  });

  it("explains a plan without own keys and turns the add button off", () => {
    const markup = renderKeys([], { planAllowed: false });

    expect(markup).toContain("AgentKeys.planRequired");
    expect(markup).toMatch(/<button[^>]*\sdisabled=""[^>]*id="agent-key-add"/);
  });

  it("hides adding, testing and removing from a member who cannot change workspace settings", () => {
    const markup = renderKeys([KEY], { canManage: false });

    expect(markup).toContain("Production");
    expect(markup).not.toContain('id="agent-key-add"');
    expect(markup).not.toContain("agent-key-test-anthropic");
    expect(markup).not.toContain("agent-key-remove-anthropic");
  });
});

describe("AgentRunnersCard", () => {
  it("lists each runner with its machine, when it was last seen and whether it is online", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentRunnersCard, {
        runners: [
          {
            id: "00000000-0000-4000-8000-0000000000c1",
            name: "ws-main",
            machine: "ubuntu-vm",
            lastSeenAt: "2026-11-17T08:00:00.000Z",
            online: true,
          },
          {
            id: "00000000-0000-4000-8000-0000000000c2",
            name: "laptop",
            machine: null,
            lastSeenAt: null,
            online: false,
          },
        ],
      }),
    );

    expect(markup).toContain("ws-main");
    expect(markup).toContain("ubuntu-vm · AgentRuntime.lastSeen(at=date:2026-11-17)");
    expect(markup).toContain("AgentRuntime.online");
    expect(markup).toContain("laptop");
    expect(markup).toContain("AgentRuntime.neverSeen");
    expect(markup).toContain("AgentRuntime.offline");
  });

  it("says no runner is connected and leaves a slot for the actions of the runner lane", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentRunnersCard, { runners: [], actions: createElement("button", { id: "runner-slot" }, "x") }),
    );

    expect(markup).toContain("AgentRuntime.runnersEmpty");
    expect(markup).toContain('id="runner-slot"');
  });
});

describe("agentRuntimeWithKeys", () => {
  it("counts the keys on the page, so adding or removing one changes the key runtime at once", () => {
    const base = availability();

    expect(agentRuntimeWithKeys(base, 1).ownKey).toMatchObject({ available: true, reason: null });
    const withKey = availability({ ownKey: { ...base.ownKey, available: true, reason: null } });
    expect(agentRuntimeWithKeys(withKey, 0).ownKey).toMatchObject({ available: false, reason: "noKey" });
  });

  it("never turns a plan that does not include own keys into an available runtime", () => {
    const free = availability({ ownKey: { available: false, reason: "plan", models: [], runners: [] } });

    expect(agentRuntimeWithKeys(free, 2)).toBe(free);
  });
});

describe("AgentRuntimesCard", () => {
  it("shows each way of running an agent as available or with the reason it is not", () => {
    const markup = renderToStaticMarkup(createElement(AgentRuntimesCard, { availability: availability() }));

    expect(markup).toMatch(/data-agent-runtime="mate" data-available="true"/);
    expect(markup).toMatch(/data-agent-runtime="ownKey" data-available="false"/);
    expect(markup).toMatch(/data-agent-runtime="runner" data-available="false"/);
    expect(markup).toContain("AgentRuntime.available");
    expect(markup).toContain("AgentRuntime.reasons.noKey");
    expect(markup).toContain("AgentRuntime.reasons.noRunner");
    expect(markup).toContain("AgentRuntime.summary.runner");
  });

  it("names the plan and the cloud as reasons", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentRuntimesCard, {
        availability: availability({
          mate: { available: false, reason: "selfHosted", models: [], runners: [] },
          ownKey: { available: false, reason: "plan", models: [], runners: [] },
        }),
      }),
    );

    expect(markup).toContain("AgentRuntime.reasons.selfHosted");
    expect(markup).toContain("AgentRuntime.reasons.plan");
  });
});
