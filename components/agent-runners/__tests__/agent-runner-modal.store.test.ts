import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  createAgentRunnerAction: vi.fn(),
  revokeAgentRunnerAction: vi.fn(),
  refreshAgentRunnersAction: vi.fn(),
}));

vi.mock("../actions", () => actions);

import { AgentRunnerModalStore } from "../agent-runner-modal.store";

const TOKEN = `cmr_${"a".repeat(43)}`;
const refresh = vi.fn();

function makeStore() {
  const rootStore = {
    registerModalStore: vi.fn(),
    localeStore: { getTranslation: (key: string) => key },
    userStore: { user: { id: "u", role: { isSystemRole: true } }, can: () => true },
    agentRunnersStore: { refresh },
  } as unknown as RootStore;
  return new AgentRunnerModalStore(rootStore);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentRunnerModalStore", () => {
  it("opens an empty form without a token", () => {
    const store = makeStore();

    store.add();

    expect(store.isOpen).toBe(true);
    expect(store.form).toEqual({ name: "" });
    expect(store.createdToken).toBeNull();
    expect(store.serverUrl).toBeNull();
  });

  it("sends the name, keeps the token and address once and refreshes the list", async () => {
    actions.createAgentRunnerAction.mockResolvedValue({
      ok: true,
      data: { runner: { id: "r" }, token: TOKEN, url: "https://app.example.test" },
    });
    const store = makeStore();
    store.add();
    store.onChange("name", "Office laptop");

    await store.onSubmit();

    expect(actions.createAgentRunnerAction).toHaveBeenCalledWith({ name: "Office laptop" });
    expect(store.createdToken).toBe(TOKEN);
    expect(store.serverUrl).toBe("https://app.example.test");
    expect(store.form.name).toBe("");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(store.isLoading).toBe(false);
  });

  it("forgets the previous token when another runner is added", async () => {
    actions.createAgentRunnerAction.mockResolvedValue({
      ok: true,
      data: { runner: { id: "r" }, token: TOKEN, url: "https://app.example.test" },
    });
    const store = makeStore();
    store.add();
    store.onChange("name", "Office laptop");
    await store.onSubmit();

    store.add();

    expect(store.createdToken).toBeNull();
    expect(store.serverUrl).toBeNull();
  });

  it("shows the failure, shows no token and does not refresh when the runner cannot be created", async () => {
    actions.createAgentRunnerAction.mockResolvedValue({
      ok: false,
      error: { errors: [], properties: { name: { errors: ["Plan required"] } } },
    });
    const store = makeStore();
    store.add();
    store.onChange("name", "Office laptop");

    await store.onSubmit();

    expect(store.createdToken).toBeNull();
    expect(store.form.name).toBe("Office laptop");
    expect(refresh).not.toHaveBeenCalled();
    expect(store.isLoading).toBe(false);
  });
});
