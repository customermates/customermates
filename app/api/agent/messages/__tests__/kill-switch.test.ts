import { describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const runAgentLane = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud" as const,
    AGENT_CHAT_ENABLED: false,
    BASE_URL: "https://app.example.com",
  },
}));
vi.mock("@/core/di", () => ({ getSendAgentMessageInteractor: () => ({ invoke }) }));
vi.mock("@/core/api/interactor-handler", () => ({
  handleError: () => new Response(null, { status: 500 }),
}));
vi.mock("@/features/agent-chat/agent-runner", () => ({ runAgentLane }));

import { POST } from "../route";

describe("agent message route kill switch", () => {
  it("refuses every turn and never reaches the provider when the Assistant is switched off", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/agent/messages", {
        method: "POST",
        body: JSON.stringify({
          clientRequestId: "00000000-0000-4000-8000-000000000001",
          text: "Hello",
          retry: false,
        }),
        headers: { "content-type": "application/json" },
      }) as never,
    );

    expect(response.status).toBe(404);
    expect(invoke).not.toHaveBeenCalled();
    expect(runAgentLane).not.toHaveBeenCalled();
  });
});
