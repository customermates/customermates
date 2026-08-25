import type { RootStore } from "@/core/stores/root.store";

import { runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const profileActions = vi.hoisted(() => ({
  createApiKeyAction: vi.fn(),
}));

vi.mock("@/app/[locale]/(protected)/profile/actions", () => profileActions);

vi.mock("@/i18n/navigation", () => ({
  IntlLink: "a",
}));

import { ApiKeyModalStore } from "../api-key-modal.store";
import { executeAiConnectionKeyCreation } from "@/components/ai-connection/ai-connection-key-creation";
import { API_KEY_MAX_EXPIRATION_SECONDS } from "@/features/api-key/api-key-expiration";

const refresh = vi.fn();
const rootStore = {
  apiKeysStore: { refresh },
  registerModalStore: vi.fn(),
} as unknown as RootStore;

function makeStore() {
  return new ApiKeyModalStore(rootStore);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => vi.useRealTimers());

describe("ApiKeyModalStore add wizard", () => {
  it("opens on the combined options screen and clears an earlier quick-connection secret", () => {
    const store = makeStore();
    store.aiConnectionStore.credentials = { cursor: { id: "old-id", key: "old-secret" } };
    store.aiConnectionStore.selectProvider("cursor");

    store.add();

    expect(store.isOpen).toBe(true);
    expect(store.creationPath).toBe("wizard");
    expect(store.aiConnectionStore.route).toEqual({ screen: "providers" });
    expect(store.aiConnectionStore.credentials).toEqual({});
  });

  it("preserves the standard API-key form and returns cleanly to all options", () => {
    const store = makeStore();
    store.add();
    store.choosePlain();
    store.onChange("name", "Synthetic integration");

    expect(store.creationPath).toBe("plain");
    expect(store.hasUnsavedChanges).toBe(true);

    store.backToOptions();

    expect(store.creationPath).toBe("wizard");
    expect(store.form).toEqual({ name: "", expiresIn: undefined });
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("still creates a plain key and refreshes only sanitized list metadata", async () => {
    profileActions.createApiKeyAction.mockResolvedValue({
      ok: true,
      data: { id: "key-id", key: "one-time-secret" },
    });
    const store = makeStore();
    store.add();
    store.choosePlain();
    store.onChange("name", "Synthetic integration");

    await store.onSubmit();

    expect(profileActions.createApiKeyAction).toHaveBeenCalledWith({
      name: "Synthetic integration",
      expiresIn: undefined,
    });
    expect(store.createdKey).toBe("one-time-secret");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("sends exact calendar-day seconds and recomputes them when submitting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 25, 15, 30));
    profileActions.createApiKeyAction.mockResolvedValue({
      ok: true,
      data: { id: "key-id", key: "one-time-secret" },
    });
    const store = makeStore();
    store.add();
    store.choosePlain();
    store.onChange("name", "Synthetic integration");

    store.setExpiresAt(new Date(2026, 7, 27));
    expect(store.form.expiresIn).toBe(2 * 24 * 60 * 60);

    vi.setSystemTime(new Date(2026, 7, 26, 0, 1));
    await store.onSubmit();

    expect(profileActions.createApiKeyAction).toHaveBeenCalledWith({
      name: "Synthetic integration",
      expiresIn: 24 * 60 * 60,
    });
  });

  it("restores a non-expiring key when the selected date is cleared", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 25, 12));
    const store = makeStore();
    store.add();
    store.choosePlain();

    store.setExpiresAt(new Date(2027, 7, 25));
    store.setExpiresAt(null);

    expect(store.expiresAt).toBeNull();
    expect(store.form.expiresIn).toBeUndefined();
  });

  it("creates a quick connection, refreshes its sanitized row exactly once, and keeps the secret in the wizard", async () => {
    profileActions.createApiKeyAction.mockResolvedValue({
      ok: true,
      data: { id: "gemini-id", key: "one-time-gemini-secret" },
    });
    const store = makeStore();
    store.add();
    store.aiConnectionStore.selectProvider("gemini");

    await executeAiConnectionKeyCreation({
      createKey: store.aiConnectionStore.createApiKey,
      failureMessage: "Synthetic fallback",
      onKeyCreated: store.refreshAfterQuickConnection,
    });

    expect(profileActions.createApiKeyAction).toHaveBeenCalledWith({
      name: "Gemini",
      expiresIn: API_KEY_MAX_EXPIRATION_SECONDS,
    });
    expect(store.aiConnectionStore.apiKey).toBe("one-time-gemini-secret");
    expect(refresh).toHaveBeenCalledTimes(1);

    await executeAiConnectionKeyCreation({
      createKey: store.aiConnectionStore.createApiKey,
      failureMessage: "Synthetic fallback",
      onKeyCreated: store.refreshAfterQuickConnection,
    });

    expect(profileActions.createApiKeyAction).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("blocks a route-driven close while creation is pending and clears the one-time key on the canonical close", () => {
    const store = makeStore();
    store.add();
    store.aiConnectionStore.selectProvider("cursor");
    runInAction(() => {
      store.aiConnectionStore.pendingTool = "cursor";
    });

    store.close();

    expect(store.isOpen).toBe(true);
    expect(store.aiConnectionStore.route).toEqual({ screen: "setup", provider: "cursor" });

    runInAction(() => {
      store.aiConnectionStore.pendingTool = null;
      store.aiConnectionStore.credentials = { cursor: { id: "cursor-id", key: "one-time-secret" } };
    });
    store.close();

    expect(store.isOpen).toBe(false);
    expect(store.aiConnectionStore.route).toEqual({ screen: "providers" });
    expect(store.aiConnectionStore.credentials).toEqual({});
  });
});
