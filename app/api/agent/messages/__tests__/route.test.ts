import type { NextRequest } from "next/server";

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const agentTurnSseStream = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud" as const,
    AGENT_CHAT_DISABLED: false,
    BASE_URL: "https://app.example.com",
  },
}));
vi.mock("@/core/di", () => ({
  getSendAgentMessageInteractor: () => ({ invoke }),
}));
vi.mock("@/core/api/interactor-handler", () => ({
  handleError: () => new Response(null, { status: 500 }),
}));
vi.mock("@/ee/agent-chat/agent-turn-stream", () => ({ agentTurnSseStream }));

import { POST } from "../route";
import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";

const clientRequestId = "00000000-0000-4000-8000-000000000001";
const conversationId = "00000000-0000-4000-8000-000000000002";
const userMessageId = "00000000-0000-4000-8000-000000000003";

function request() {
  return new Request("https://app.example.com/api/agent/messages", {
    method: "POST",
    body: JSON.stringify({ clientRequestId, text: "Hello", retry: false }),
    headers: { "content-type": "application/json" },
  }) as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("agent message admission route", () => {
  it("maps an exhausted allowance to a safe 429 response", async () => {
    invoke.mockResolvedValue({
      ok: false,
      error: createZodError("Not enough AI credits remain to start another request.", [], {
        error: CustomErrorCode.agentLimitReached,
        kind: "rate_limit",
      }),
    });

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(await response.json()).toBe("Not enough AI credits remain to start another request.");
    expect(agentTurnSseStream).not.toHaveBeenCalled();
  });

  it("maps a canonical admission conflict to 409 without starting the provider", async () => {
    invoke.mockResolvedValue({
      ok: false,
      error: createZodError("Another Assistant turn is already running.", [], {
        error: CustomErrorCode.agentTurnAlreadyRunning,
        kind: "conflict",
      }),
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toContain("Another Assistant turn is already running.");
    expect(agentTurnSseStream).not.toHaveBeenCalled();
  });

  it("serves the durable run only for a newly admitted turn", async () => {
    invoke.mockResolvedValue({
      ok: true,
      data: {
        disposition: "run",
        externalRunId: "wrun_test",
        companyId: "company-1",
        userId: "user-1",
        runId: "run-1",
        turnRequestId: "turn-1",
        userMessageId,
        clientRequestId,
        userName: "Max",
        conversationId,
        locale: "en",
        preAuthorized: [],
        messages: [{ role: "user", text: "Hello" }],
      },
    });
    agentTurnSseStream.mockReturnValue(
      new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("x-conversation-id")).toBe(conversationId);
    expect(response.headers.get("x-user-message-id")).toBe(userMessageId);
    expect(response.headers.get("x-client-request-id")).toBe(clientRequestId);
    expect(agentTurnSseStream).toHaveBeenCalledWith("wrun_test");
  });

  it("replays the exact canonical assistant message without invoking the provider", async () => {
    invoke.mockResolvedValue({
      ok: true,
      data: {
        disposition: "completedReplay",
        conversationId,
        userMessageId,
        clientRequestId,
        assistantMessage: {
          id: "assistant-1",
          parts: [{ type: "text", text: "Already done." }],
          createdAt: new Date("2026-08-06T10:00:00.000Z"),
        },
        terminalCode: "partial",
        affectedResources: ["contacts"],
      },
    });

    const response = await POST(request());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(agentTurnSseStream).not.toHaveBeenCalled();
    expect(body).toContain('"type":"message_replay"');
    expect(body).toContain('"messageId":"assistant-1"');
    expect(body).toContain('"type":"turn_done"');
    expect(body).toContain('"terminalCode":"partial"');
    expect(body).toContain('"isError":true');
  });

  it.each(["running", "failed", "uncertain"] as const)(
    "returns a tenant-bound 409 for a duplicate %s turn",
    async (disposition) => {
      invoke.mockResolvedValue({
        ok: true,
        data: {
          disposition,
          clientRequestId,
          conversationId,
          userMessageId,
          retryAllowed: disposition === "failed",
        },
      });

      const response = await POST(request());

      expect(response.status).toBe(409);
      expect(response.headers.get("x-conversation-id")).toBe(conversationId);
      expect(response.headers.get("x-user-message-id")).toBe(userMessageId);
      expect(await response.json()).toMatchObject({
        code: `agent_turn_${disposition}`,
        disposition,
        retryAllowed: disposition === "failed",
      });
      expect(agentTurnSseStream).not.toHaveBeenCalled();
    },
  );

  it("returns a conflict without leaking a stored conversation identity", async () => {
    invoke.mockResolvedValue({
      ok: true,
      data: { disposition: "conflict", clientRequestId, retryAllowed: false },
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(response.headers.get("x-conversation-id")).toBeNull();
    expect(await response.json()).toMatchObject({
      disposition: "conflict",
      retryAllowed: false,
    });
  });
});
