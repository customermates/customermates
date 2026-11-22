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
import { agentRunFailureLabel } from "../agent-labels";
import { agentRuntimeWithKeys } from "../agent-runtime-with-keys";
import { agentRuntimeStatus, agentRuntimeStatusVariant, initialAgentRuntime } from "../agent-runtime-status";

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

  it("notes on a key the provider would not let it check, and on no other key", () => {
    const unverified = renderKeys([{ ...KEY, validatedAt: null }]);
    expect(unverified).toContain("data-agent-key-unverified");
    expect(unverified).toContain("AgentKeys.unverifiedNote");

    const checked = renderKeys([KEY]);
    expect(checked).not.toContain("data-agent-key-unverified");
    expect(checked).not.toContain("AgentKeys.unverifiedNote");
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

describe("agentRunFailureLabel", () => {
  it("names the failures of a run that have their own text and leaves the others to the caller", () => {
    const t = ((key: string) => key) as never;

    expect(agentRunFailureLabel(t, "contextLimit")).toBe("AgentJobs.errors.contextLimit");
    expect(agentRunFailureLabel(t, "modelRequired")).toBe("AgentJobs.errors.modelRequired");
    expect(agentRunFailureLabel(t, "planRequired")).toBe("AgentJobs.errors.planRequired");
    expect(agentRunFailureLabel(t, "APICallError:429")).toBeNull();
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

describe("agentRuntimeStatus", () => {
  const online = { online: true, revokedAt: null };
  const offline = { online: false, revokedAt: null };
  const revoked = { online: false, revokedAt: "2026-11-17T09:30:00.000Z" };

  it("counts the keys and the online computers and marks a computer that went away", () => {
    const keyed = availability({ ownKey: { available: true, reason: null, models: [], runners: [] } });

    expect(agentRuntimeStatus("mate", keyed, { keyCount: 0, runners: [] })).toEqual({ kind: "available" });
    expect(agentRuntimeStatus("ownKey", keyed, { keyCount: 2, runners: [] })).toEqual({ kind: "keys", count: 2 });
    expect(agentRuntimeStatus("runner", keyed, { keyCount: 0, runners: [online, offline] })).toEqual({
      kind: "online",
      count: 1,
    });
    expect(agentRuntimeStatus("runner", keyed, { keyCount: 0, runners: [offline, revoked] })).toEqual({
      kind: "offline",
    });
    expect(agentRuntimeStatus("runner", keyed, { keyCount: 0, runners: [revoked] })).toEqual({
      kind: "unavailable",
      reason: "noRunner",
    });
  });

  it("keeps the plan and the cloud as reasons even when computers exist", () => {
    const blocked = availability({
      mate: { available: false, reason: "selfHosted", models: [], runners: [] },
      runner: { available: false, reason: "plan", models: [], runners: [] },
    });

    expect(agentRuntimeStatus("mate", blocked, { keyCount: 0, runners: [] })).toEqual({
      kind: "unavailable",
      reason: "selfHosted",
    });
    expect(agentRuntimeStatus("runner", blocked, { keyCount: 0, runners: [online] })).toEqual({
      kind: "unavailable",
      reason: "plan",
    });
    expect(agentRuntimeStatusVariant({ kind: "offline" })).toBe("warning");
    expect(agentRuntimeStatusVariant({ kind: "keys", count: 1 })).toBe("success");
    expect(agentRuntimeStatusVariant({ kind: "unavailable", reason: "plan" })).toBe("secondary");
  });

  it("opens the runtime that works, else the one already set up, else Mate", () => {
    const none = availability({ mate: { available: false, reason: "plan", models: [], runners: [] } });

    expect(initialAgentRuntime(availability(), { keyCount: 0, runners: [] })).toBe("mate");
    expect(initialAgentRuntime(none, { keyCount: 0, runners: [offline] })).toBe("runner");
    expect(initialAgentRuntime(none, { keyCount: 1, runners: [] })).toBe("ownKey");
    expect(initialAgentRuntime(none, { keyCount: 0, runners: [] })).toBe("mate");
  });
});
