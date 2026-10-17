import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  cleanups: [] as (() => void)[],
  hasWorkspaceChanged: vi.fn(() => false),
}));

vi.mock("react", () => ({
  useEffect: (effect: () => (() => void) | undefined) => {
    const cleanup = effect();
    if (cleanup) harness.cleanups.push(cleanup);
  },
}));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: vi.fn() }));
vi.mock("@/core/errors/workspace-changed-notice", () => ({ hasWorkspaceChanged: harness.hasWorkspaceChanged }));

import { useAgentChatConfig } from "../use-agent-chat-config";

type ConfigStore = { enabled: boolean | null; loadConfig: () => Promise<string> };

function ConfigLoader({ store }: { store: ConfigStore }) {
  useAgentChatConfig(store as never);
  return null;
}

function configStore(...statuses: string[]) {
  const loadConfig = vi.fn(() => Promise.resolve("retry"));
  for (const status of statuses) loadConfig.mockResolvedValueOnce(status);
  return { enabled: null, loadConfig };
}

beforeEach(() => {
  vi.useFakeTimers();
  harness.hasWorkspaceChanged.mockReturnValue(false);
});

afterEach(() => {
  for (const cleanup of harness.cleanups.splice(0)) cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useAgentChatConfig", () => {
  it("stops retrying when the config load reports a changed workspace", async () => {
    const store = configStore("workspaceChanged");
    ConfigLoader({ store });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(store.loadConfig).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops backing off once another request opened the reload dialog", async () => {
    const store = configStore();
    ConfigLoader({ store });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    harness.hasWorkspaceChanged.mockReturnValue(true);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(store.loadConfig).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
