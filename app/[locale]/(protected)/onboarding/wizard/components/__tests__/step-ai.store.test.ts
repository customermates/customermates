import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const profileActions = vi.hoisted(() => ({
  createApiKeyAction: vi.fn(),
}));

vi.mock("../../../../profile/actions", () => profileActions);

import { StepAiStore } from "../step-ai.store";

const rootStore = {} as RootStore;

function makeStore(): StepAiStore {
  return new StepAiStore(rootStore);
}

function successfulKey(id: string, key: string) {
  return { ok: true, data: { id, key } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StepAiStore routing", () => {
  it("starts on the five-provider chooser with Finish disabled", () => {
    const store = makeStore();

    expect(store.route).toEqual({ screen: "providers" });
    expect(store.selectedProvider).toBeNull();
    expect(store.canFinish).toBe(false);
  });

  it.each([
    ["claude", { screen: "claude" }, null, false],
    ["chatgpt", { screen: "setup", provider: "chatgpt" }, null, true],
    ["codex", { screen: "setup", provider: "codex" }, "codex", false],
    ["cursor", { screen: "setup", provider: "cursor" }, "cursor", false],
    ["gemini", { screen: "setup", provider: "gemini" }, "gemini", false],
  ] as const)("routes %s to its supported setup", (provider, route, tool, canFinish) => {
    const store = makeStore();

    store.selectProvider(provider);

    expect(store.route).toEqual(route);
    expect(store.selectedTool).toBe(tool);
    expect(store.canFinish).toBe(canFinish);
  });

  it("reveals the Claude account path without creating a key", () => {
    const store = makeStore();
    store.selectProvider("claude");

    store.selectClaudeMethod("account");

    expect(store.connectorProvider).toBe("claude");
    expect(store.selectedTool).toBeNull();
    expect(store.canFinish).toBe(true);
    expect(profileActions.createApiKeyAction).not.toHaveBeenCalled();
  });

  it("waits for an exact Claude local client before key creation is possible", async () => {
    const store = makeStore();
    store.selectProvider("claude");
    store.selectClaudeMethod("local");

    await store.createApiKey();

    expect(store.selectedTool).toBeNull();
    expect(store.canFinish).toBe(false);
    expect(profileActions.createApiKeyAction).not.toHaveBeenCalled();

    store.selectClaudeClient("claudeDesktop");

    expect(store.selectedTool).toBe("claudeDesktop");
    expect(store.canFinish).toBe(false);
  });

  it("uses Skip as an optional terminal path and restores the provider chooser on Back", () => {
    const store = makeStore();

    store.selectSkip();

    expect(store.route).toEqual({ screen: "skip" });
    expect(store.canFinish).toBe(true);

    store.backToProviders();

    expect(store.route).toEqual({ screen: "providers" });
    expect(store.canFinish).toBe(false);
  });
});

describe("StepAiStore API-key lifecycle", () => {
  it("creates a key for the exact client and enables Finish", async () => {
    profileActions.createApiKeyAction.mockResolvedValue(successfulKey("key-id", "secret-key"));
    const store = makeStore();
    store.selectProvider("codex");

    await store.createApiKey();

    expect(profileActions.createApiKeyAction).toHaveBeenCalledWith({
      name: "Codex",
      expiresIn: 365 * 24 * 60 * 60,
    });
    expect(store.credential).toEqual({ id: "key-id", key: "secret-key" });
    expect(store.apiKey).toBe("secret-key");
    expect(store.isCreating).toBe(false);
    expect(store.hasError).toBe(false);
    expect(store.canFinish).toBe(true);
  });

  it("preserves the Claude variant and key across Back and forward navigation", async () => {
    profileActions.createApiKeyAction.mockResolvedValue(successfulKey("claude-id", "claude-secret"));
    const store = makeStore();
    store.selectProvider("claude");
    store.selectClaudeMethod("local");
    store.selectClaudeClient("claudeDesktop");
    await store.createApiKey();

    store.backToProviders();

    expect(store.route).toEqual({ screen: "providers" });
    expect(store.claudeMethod).toBe("local");
    expect(store.claudeClient).toBe("claudeDesktop");
    expect(store.canFinish).toBe(false);

    store.selectProvider("claude");

    expect(store.apiKey).toBe("claude-secret");
    expect(store.canFinish).toBe(true);

    await store.createApiKey();

    expect(profileActions.createApiKeyAction).toHaveBeenCalledTimes(1);
  });

  it("allows one intentionally separate key per local client while restoring earlier keys", async () => {
    profileActions.createApiKeyAction
      .mockResolvedValueOnce(successfulKey("codex-id", "codex-secret"))
      .mockResolvedValueOnce(successfulKey("cursor-id", "cursor-secret"));
    const store = makeStore();
    store.selectProvider("codex");
    await store.createApiKey();
    store.backToProviders();
    store.selectProvider("cursor");
    await store.createApiKey();
    store.backToProviders();
    store.selectProvider("codex");

    expect(store.apiKey).toBe("codex-secret");

    await store.createApiKey();

    expect(profileActions.createApiKeyAction).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent creation and locks navigation until the plaintext key is visible", async () => {
    let resolveCreation: (value: ReturnType<typeof successfulKey>) => void = () => undefined;
    profileActions.createApiKeyAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreation = resolve;
        }),
    );
    const store = makeStore();
    store.selectProvider("gemini");

    const first = store.createApiKey();
    const second = store.createApiKey();

    expect(store.isCreating).toBe(true);
    expect(store.canFinish).toBe(false);
    expect(profileActions.createApiKeyAction).toHaveBeenCalledTimes(1);

    store.backToProviders();
    store.selectSkip();
    store.selectProvider("chatgpt");

    expect(store.route).toEqual({ screen: "setup", provider: "gemini" });

    resolveCreation(successfulKey("gemini-id", "gemini-secret"));
    await Promise.all([first, second]);

    expect(store.apiKey).toBe("gemini-secret");
    expect(store.canFinish).toBe(true);
  });

  it("surfaces a structured failure, keeps Finish disabled, and permits retry", async () => {
    profileActions.createApiKeyAction
      .mockResolvedValueOnce({ ok: false, error: { formErrors: [], fieldErrors: {} } })
      .mockResolvedValueOnce(successfulKey("retry-id", "retry-secret"));
    const store = makeStore();
    store.selectProvider("cursor");

    await store.createApiKey();

    expect(store.hasError).toBe(true);
    expect(store.isCreating).toBe(false);
    expect(store.credential).toBeNull();
    expect(store.canFinish).toBe(false);

    await store.createApiKey();

    expect(store.hasError).toBe(false);
    expect(store.apiKey).toBe("retry-secret");
    expect(store.canFinish).toBe(true);
  });

  it("handles a rejected server action without losing the retry path", async () => {
    profileActions.createApiKeyAction.mockRejectedValue(new Error("network unavailable"));
    const store = makeStore();
    store.selectProvider("claude");
    store.selectClaudeMethod("local");
    store.selectClaudeClient("claudeCode");

    await expect(store.createApiKey()).resolves.toBeUndefined();

    expect(store.hasError).toBe(true);
    expect(store.isCreating).toBe(false);
    expect(store.credential).toBeNull();
    expect(store.canFinish).toBe(false);
  });
});
