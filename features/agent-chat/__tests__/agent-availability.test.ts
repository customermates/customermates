import { describe, expect, it, vi } from "vitest";

const envState = vi.hoisted(() => ({ APP_MODE: "cloud" as "cloud" | "self-hosted", AGENT_CHAT_DISABLED: false }));

vi.mock("@/env", () => ({ env: envState }));

import { AgentSessionUnavailableError } from "@/core/errors/app-errors";

import { RequiresAgentChat, isAgentChatAvailable } from "../agent-availability";

class Guarded {
  @RequiresAgentChat
  invoke() {
    return Promise.resolve("ran");
  }
}

describe("agent availability", () => {
  it("runs a guarded interactor only on a cloud deployment that has not switched the assistant off", async () => {
    envState.APP_MODE = "cloud";
    envState.AGENT_CHAT_DISABLED = false;

    expect(isAgentChatAvailable()).toBe(true);
    await expect(new Guarded().invoke()).resolves.toBe("ran");
  });

  it.each([
    ["self-hosted deployment", { APP_MODE: "self-hosted" as const, AGENT_CHAT_DISABLED: false }],
    ["cloud deployment with the kill switch set", { APP_MODE: "cloud" as const, AGENT_CHAT_DISABLED: true }],
  ])("refuses a guarded interactor on a %s", async (_name, state) => {
    Object.assign(envState, state);

    expect(isAgentChatAvailable()).toBe(false);
    await expect(new Guarded().invoke()).rejects.toBeInstanceOf(AgentSessionUnavailableError);
  });
});
