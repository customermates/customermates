import type { Root } from "react-dom/client";
import type { AgentProviderKeyDto } from "@/ee/agent-keys/agent-provider-key.schema";
import type { AgentJobSummary } from "@/features/agent-jobs/agent-job.schema";
import type { ListedAgentRunner } from "@/features/agent-runners/get-agent-runners.interactor";
import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ rootStore: null as unknown }));

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, string | number>) =>
        values
          ? `${key}(${Object.entries(values)
              .map(([name, value]) => `${name}=${value}`)
              .join(",")})`
          : key,
      { rich: (key: string) => key },
    ),
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatNumericalShortDateTime: (date: Date) => date.toISOString().slice(0, 16),
  }),
}));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showConfirmation: vi.fn(), showDeleteConfirmation: vi.fn() }),
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: (props: Record<string, unknown>) => createElement("a", props),
}));
vi.mock("../agent-key-modal", () => ({ AgentKeyModal: () => null }));
vi.mock("@/components/agent-runners/agent-runner-modal", () => ({ AgentRunnerModal: () => null }));

import { AgentsPageView } from "../agents-page-view";

const RUNNER: ListedAgentRunner = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Office Mac mini",
  machine: null,
  clients: [{ name: "claude", version: "2.1.0" }],
  lastSeenAt: "2026-11-20T09:00:00.000Z",
  online: true,
  revokedAt: null,
  createdById: "33333333-3333-4333-8333-333333333333",
  createdAt: "2026-11-16T10:00:00.000Z",
  createdByName: "Max Bergmann",
};

const KEY: AgentProviderKeyDto = {
  id: "00000000-0000-4000-8000-0000000000a1",
  provider: "anthropic",
  label: "Production",
  last4: "0001",
  defaultModel: null,
  validatedAt: "2026-11-17T08:00:00.000Z",
  lastUsedAt: null,
  createdAt: "2026-11-17T07:00:00.000Z",
};

const RUN: AgentJobSummary = {
  id: "00000000-0000-4000-8000-0000000000b1",
  runtime: "runner",
  status: "failed",
  sourceKind: "rule",
  sourceId: "00000000-0000-4000-8000-0000000000c1",
  rule: { id: "00000000-0000-4000-8000-0000000000d1", name: "Ask the office agent for a brief" },
  model: null,
  runnerId: RUNNER.id,
  attempts: 1,
  inputTokens: null,
  outputTokens: null,
  costMicrocents: null,
  error: "runnerStopped",
  result: null,
  startedAt: null,
  finishedAt: null,
  createdAt: "2026-11-14T13:20:00.000Z",
};

function availability(overrides: Partial<AgentRuntimeAvailability> = {}): AgentRuntimeAvailability {
  const none = { models: [], runners: [] };
  return {
    mate: { available: false, reason: "plan", ...none },
    ownKey: { available: false, reason: "noKey", ...none },
    runner: { available: true, reason: null, ...none },
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

function rootStore(keys: AgentProviderKeyDto[], runners: ListedAgentRunner[]) {
  return {
    agentKeysStore: { items: keys, setItems: vi.fn(), canManage: true, busyId: null },
    agentKeyModalStore: { add: vi.fn() },
    agentRunnersStore: {
      items: runners,
      setItems: vi.fn(),
      canManage: true,
      canRevoke: true,
      hasLiveRunner: false,
      refresh: vi.fn(),
    },
    agentRunnerModalStore: { add: vi.fn() },
    agentRunsStore: {
      items: [RUN],
      setPage: vi.fn(),
      expandedId: null,
      expanded: null,
      loadingDetailId: null,
      toggle: vi.fn(),
    },
  };
}

async function render(options: { keys?: AgentProviderKeyDto[]; runners?: ListedAgentRunner[]; mate?: boolean } = {}) {
  const keys = options.keys ?? [];
  const runners = options.runners ?? [RUNNER];
  harness.rootStore = rootStore(keys, runners);
  const runtimes = availability(
    options.mate ? { mate: { available: true, reason: null, models: [], runners: [] } } : {},
  );
  await act(async () => {
    root.render(
      createElement(AgentsPageView, {
        availability: runtimes,
        keys,
        runners,
        runs: { jobs: [RUN], nextCursor: null },
      }),
    );
    await Promise.resolve();
  });
}

const card = (runtime: string) => container.querySelector<HTMLButtonElement>(`[data-agent-runtime="${runtime}"]`);
const details = () => container.querySelector<HTMLElement>("[data-agent-runtime-details]");

async function click(element: HTMLElement | null | undefined) {
  await act(async () => {
    element?.click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AgentsPageView", () => {
  it("offers the three runtimes as cards with their status and opens the one that works", async () => {
    await render();

    expect(card("mate")?.textContent).toContain("AgentRuntime.reasons.plan");
    expect(card("mate")?.querySelector("[data-mate-orb]")).not.toBeNull();
    expect(card("ownKey")?.textContent).toContain("AgentRuntime.reasons.noKey");
    expect(card("runner")?.textContent).toContain("AgentsPage.onlineCount(count=1)");
    expect(card("runner")?.getAttribute("aria-pressed")).toBe("true");
    expect(details()?.dataset.agentRuntimeDetails).toBe("runner");
    expect(details()?.querySelector("#agent-runners")).not.toBeNull();
  });

  it("shows only the details of the card the member picks", async () => {
    await render();

    await click(card("ownKey"));
    expect(card("ownKey")?.getAttribute("aria-pressed")).toBe("true");
    expect(card("runner")?.getAttribute("aria-pressed")).toBe("false");
    expect(details()?.querySelector("#agent-keys")).not.toBeNull();
    expect(details()?.querySelector("#agent-runners")).toBeNull();
    expect(details()?.textContent).toContain("AgentKeys.keysEmpty");

    await click(card("mate"));
    expect(details()?.querySelector("#agent-mate")).not.toBeNull();
    expect(details()?.textContent).toContain("AgentsPage.mate.notInPlan");
    expect(details()?.textContent).toContain("AgentsPage.mate.seePlans");
    expect(details()?.querySelector("#agent-keys")).toBeNull();
  });

  it("lists a computer with its status, CLI version, start command and menu", async () => {
    await render();
    const row = container.querySelector<HTMLElement>(`[data-agent-runner="${RUNNER.id}"]`);

    expect(row?.dataset.status).toBe("online");
    expect(row?.textContent).toContain("Runners.status.online");
    expect(row?.textContent).toContain("Runners.clientNames.claude 2.1.0");
    expect(row?.textContent).toContain("Max Bergmann");
    expect(row?.textContent).toContain("Runners.startCommand");
    expect(row?.querySelector("[data-item-actions-trigger]")).not.toBeNull();
  });

  it("starts on Mate when the plan includes it and counts provider keys", async () => {
    await render({ mate: true, keys: [KEY] });

    expect(card("mate")?.getAttribute("aria-pressed")).toBe("true");
    expect(card("mate")?.textContent).toContain("AgentRuntime.available");
    expect(details()?.textContent).toContain("AgentsPage.mate.ready");
  });

  it("shows recent runs as one line each with a link to all runs in Automations", async () => {
    await render();
    const run = container.querySelector<HTMLElement>(`[data-agent-run="${RUN.id}"]`);

    expect(run?.textContent).toContain("Ask the office agent for a brief");
    expect(run?.textContent).toContain("AgentJobs.errors.runnerStopped");
    expect(run?.textContent).toContain("Office Mac mini");
    expect(container.querySelector("[data-agent-runs-all]")?.getAttribute("href")).toBe("/automations");
  });
});
