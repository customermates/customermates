import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";
import type { AgentProviderKeyDto } from "@/ee/agent-keys/agent-provider-key.schema";

const harness = vi.hoisted(() => ({
  saveAgentProviderKeyAction: vi.fn(),
  testAgentProviderKeyAction: vi.fn(),
  deleteAgentProviderKeyAction: vi.fn(),
  refreshAgentProviderKeysAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: harness.toastError, success: harness.toastSuccess } }));
vi.mock("../agent-key-actions", () => ({
  saveAgentProviderKeyAction: harness.saveAgentProviderKeyAction,
  testAgentProviderKeyAction: harness.testAgentProviderKeyAction,
  deleteAgentProviderKeyAction: harness.deleteAgentProviderKeyAction,
  refreshAgentProviderKeysAction: harness.refreshAgentProviderKeysAction,
  getAgentJobAction: vi.fn(),
  getAgentJobsAction: vi.fn(),
}));

import { AgentKeyModalStore } from "../agent-key-modal.store";
import { AgentKeysStore } from "../agent-keys.store";

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

function rootStore(canUpdate = true) {
  const keysStore: { refresh: ReturnType<typeof vi.fn> } = { refresh: vi.fn().mockResolvedValue(undefined) };
  const root = {
    agentKeysStore: keysStore,
    registerModalStore: vi.fn(),
    localeStore: { getTranslation: (key: string) => key },
    loadingOverlayStore: { withLoading: <T>(run: () => Promise<T>) => run() },
    userStore: { user: { id: "user-1" }, can: () => canUpdate, canAccess: () => canUpdate },
  } as unknown as RootStore;
  return { root, keysStore };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentKeyModalStore", () => {
  it("opens with the first provider and its default model preselected and empty secret fields", () => {
    const { root } = rootStore();
    const store = new AgentKeyModalStore(root);

    store.add();

    expect(store.isOpen).toBe(true);
    expect(store.form).toEqual({ provider: "anthropic", label: "", apiKey: "", defaultModel: "claude-sonnet-5-5" });
  });

  it("switches the default model to the new provider's own default", () => {
    const store = new AgentKeyModalStore(rootStore().root);
    store.add();

    store.selectProvider("openai");
    expect(store.form.provider).toBe("openai");
    expect(store.form.defaultModel).toBe("gpt-5-mini");

    store.selectProvider("google");
    expect(store.form.defaultModel).toBe("gemini-2.5-flash");
  });

  it("saves the key, refreshes the list, clears the secret and closes", async () => {
    harness.saveAgentProviderKeyAction.mockResolvedValue({ ok: true, data: KEY });
    const { root, keysStore } = rootStore();
    const store = new AgentKeyModalStore(root);
    store.add();
    store.onChange("label", "Production");
    store.onChange("apiKey", "sk-ant-api03-EXAMPLE-0001");

    await store.onSubmit();

    expect(harness.saveAgentProviderKeyAction).toHaveBeenCalledWith({
      provider: "anthropic",
      label: "Production",
      apiKey: "sk-ant-api03-EXAMPLE-0001",
      defaultModel: "claude-sonnet-5-5",
    });
    expect(keysStore.refresh).toHaveBeenCalledTimes(1);
    expect(store.isOpen).toBe(false);
    expect(store.form.apiKey).toBe("");
    expect(store.isLoading).toBe(false);
  });

  it("keeps the modal open with the typed values when the provider refuses the key", async () => {
    const error = { errors: [], properties: { apiKey: { errors: ["The provider did not accept this key."] } } };
    harness.saveAgentProviderKeyAction.mockResolvedValue({ ok: false, error });
    const { root, keysStore } = rootStore();
    const store = new AgentKeyModalStore(root);
    store.add();
    store.onChange("label", "Production");
    store.onChange("apiKey", "sk-ant-wrong-0000");

    await store.onSubmit();

    expect(store.isOpen).toBe(true);
    expect(store.form.apiKey).toBe("sk-ant-wrong-0000");
    expect(store.error).toEqual(error);
    expect(keysStore.refresh).not.toHaveBeenCalled();
    expect(harness.toastError).toHaveBeenCalledWith("The provider did not accept this key.");
    expect(store.isLoading).toBe(false);
  });

  it("is read-only for a member who may not change workspace settings", () => {
    const store = new AgentKeyModalStore(rootStore(false).root);
    expect(store.canManage).toBe(false);
    expect(store.isReadOnly).toBe(true);
  });
});

describe("AgentKeysStore", () => {
  it("replaces a key in place after a successful test and announces it", async () => {
    const tested = { ...KEY, validatedAt: "2026-11-17T10:00:00.000Z" };
    harness.testAgentProviderKeyAction.mockResolvedValue({ ok: true, data: tested });
    const store = new AgentKeysStore(rootStore().root);
    store.setItems([KEY]);

    expect(await store.test(KEY.id)).toBe(true);

    expect(store.items).toEqual([tested]);
    expect(store.busyId).toBeNull();
    expect(harness.toastSuccess).toHaveBeenCalledWith("AgentKeys.testSucceeded", expect.anything());
  });

  it("leaves the list unchanged and shows the failure when the test is refused", async () => {
    harness.testAgentProviderKeyAction.mockResolvedValue({
      ok: false,
      error: { errors: [], properties: { id: { errors: ["The provider did not accept this key."] } } },
    });
    const store = new AgentKeysStore(rootStore().root);
    store.setItems([KEY]);

    expect(await store.test(KEY.id)).toBe(false);

    expect(store.items).toEqual([KEY]);
    expect(store.busyId).toBeNull();
    expect(harness.toastError).toHaveBeenCalledWith("The provider did not accept this key.");
  });

  it("removes a key from the list only after the server removed it", async () => {
    const store = new AgentKeysStore(rootStore().root);
    store.setItems([KEY]);

    harness.deleteAgentProviderKeyAction.mockResolvedValueOnce({
      ok: false,
      error: { errors: [], properties: { id: { errors: ["This AI key was not found in this workspace."] } } },
    });
    expect(await store.remove(KEY.id)).toBe(false);
    expect(store.items).toEqual([KEY]);

    harness.deleteAgentProviderKeyAction.mockResolvedValueOnce({ ok: true, data: { id: KEY.id } });
    expect(await store.remove(KEY.id)).toBe(true);
    expect(store.items).toEqual([]);
  });

  it("reloads the list from the server", async () => {
    harness.refreshAgentProviderKeysAction.mockResolvedValue({ ok: true, data: { keys: [KEY] } });
    const store = new AgentKeysStore(rootStore().root);

    await store.refresh();

    expect(store.items).toEqual([KEY]);
  });

  it("only lets people who may update workspace settings manage keys", () => {
    expect(new AgentKeysStore(rootStore(true).root).canManage).toBe(true);
    expect(new AgentKeysStore(rootStore(false).root).canManage).toBe(false);
  });
});
