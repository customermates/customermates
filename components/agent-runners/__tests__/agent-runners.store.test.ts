import type { RootStore } from "@/core/stores/root.store";
import type { AgentRunnerDto } from "@/features/agent-runners/agent-runner.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  refreshAgentRunnersAction: vi.fn(),
  revokeAgentRunnerAction: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: harness.toastError, success: vi.fn() } }));
vi.mock("../actions", () => ({
  createAgentRunnerAction: vi.fn(),
  refreshAgentRunnersAction: harness.refreshAgentRunnersAction,
  revokeAgentRunnerAction: harness.revokeAgentRunnerAction,
}));
vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
  upsertP13nAction: vi.fn(),
}));

import { AgentRunnersStore } from "../agent-runners.store";

const RUNNER_ID = "44444444-4444-4444-8444-444444444444";

function runner(overrides: Partial<AgentRunnerDto> = {}): AgentRunnerDto {
  return {
    id: RUNNER_ID,
    name: "Office laptop",
    machine: null,
    clients: [],
    lastSeenAt: null,
    online: false,
    revokedAt: null,
    createdById: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-11-16T10:00:00.000Z",
    ...overrides,
  };
}

function makeStore(can: (resource: string, action: string) => boolean = () => true) {
  const rootStore = {
    loadingOverlayStore: { isLoading: false, withLoading: <T>(fn: () => Promise<T>) => fn() },
    localeStore: { getTranslation: (key: string) => key },
    userStore: { user: { id: "u", role: { isSystemRole: true } }, can },
  } as unknown as RootStore;
  return new AgentRunnersStore(rootStore);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentRunnersStore", () => {
  it("lists the runners of the workspace", async () => {
    harness.refreshAgentRunnersAction.mockResolvedValue({ ok: true, data: { runners: [runner()] } });
    const store = makeStore();

    await store.refresh();

    expect(store.items.map((item) => item.name)).toEqual(["Office laptop"]);
  });

  it("lets a member revoke with the delete permission on API & Webhooks and add with the create permission", () => {
    const deleteOnly = makeStore((resource, action) => resource === "api" && action === "delete");
    const createOnly = makeStore((resource, action) => resource === "api" && action === "create");

    expect([deleteOnly.canRevoke, deleteOnly.canManage]).toEqual([true, false]);
    expect([createOnly.canRevoke, createOnly.canManage]).toEqual([false, true]);
  });

  it("knows whether a runner is left whose state can still change", async () => {
    const store = makeStore();
    expect(store.hasLiveRunner).toBe(false);

    harness.refreshAgentRunnersAction.mockResolvedValue({
      ok: true,
      data: { runners: [runner({ revokedAt: "2026-11-17T09:00:00.000Z" })] },
    });
    await store.refresh();
    expect(store.hasLiveRunner).toBe(false);

    harness.refreshAgentRunnersAction.mockResolvedValue({ ok: true, data: { runners: [runner()] } });
    await store.refresh();
    expect(store.hasLiveRunner).toBe(true);
  });

  it("revokes a runner and reloads the list so it shows as revoked", async () => {
    harness.revokeAgentRunnerAction.mockResolvedValue({
      ok: true,
      data: { id: RUNNER_ID, revokedAt: "2026-11-17T09:00:00.000Z" },
    });
    harness.refreshAgentRunnersAction.mockResolvedValue({
      ok: true,
      data: { runners: [runner({ revokedAt: "2026-11-17T09:00:00.000Z" })] },
    });
    const store = makeStore();

    const revoked = await store.revoke(RUNNER_ID);

    expect(revoked).toBe(true);
    expect(harness.revokeAgentRunnerAction).toHaveBeenCalledWith({ id: RUNNER_ID });
    expect(store.items[0].revokedAt).toBe("2026-11-17T09:00:00.000Z");
  });

  it("tells the user and keeps the list when the runner cannot be revoked", async () => {
    harness.revokeAgentRunnerAction.mockResolvedValue({
      ok: false,
      error: { errors: [], properties: { id: { errors: ["Runner not found"] } } },
    });
    const store = makeStore();

    expect(await store.revoke(RUNNER_ID)).toBe(false);
    expect(harness.toastError).toHaveBeenCalled();
    expect(harness.refreshAgentRunnersAction).not.toHaveBeenCalled();
  });
});
