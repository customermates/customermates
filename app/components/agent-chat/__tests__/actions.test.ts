import { beforeEach, describe, expect, it, vi } from "vitest";

const di = vi.hoisted(() => ({
  getArchiveAgentConversationInteractor: vi.fn(),
  getDeleteAgentConversationInteractor: vi.fn(),
  getGetAgentConfigInteractor: vi.fn(),
  getGetAgentConversationInteractor: vi.fn(),
  getListAgentConversationsInteractor: vi.fn(),
  getRespondToApprovalInteractor: vi.fn(),
  getRespondToUiCommandInteractor: vi.fn(),
  getRestoreAgentConversationInteractor: vi.fn(),
}));

vi.mock("@/core/di", () => di);

import {
  archiveAgentConversationAction,
  deleteAgentConversationAction,
  getAgentConfigAction,
  getAgentConversationAction,
  listAgentConversationsAction,
  respondToApprovalAction,
  respondToUiCommandAction,
  restoreAgentConversationAction,
} from "../actions";

const conversationId = "00000000-0000-4000-8000-000000000001";

function useInteractor(getter: ReturnType<typeof vi.fn>, result: unknown) {
  const invoke = vi.fn().mockResolvedValue(result);
  getter.mockReturnValue({ invoke });
  return invoke;
}

describe("agent server actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes a disabled configuration through as data", async () => {
    const invoke = useInteractor(di.getGetAgentConfigInteractor, {
      ok: true,
      data: { enabled: false },
    });

    await expect(getAgentConfigAction()).resolves.toEqual({ ok: true, data: { enabled: false } });
    expect(invoke).toHaveBeenCalledOnce();
  });

  it("delegates every remaining operation and only shapes its result", async () => {
    const getConversation = useInteractor(di.getGetAgentConversationInteractor, {
      ok: true,
      data: { messages: [] },
    });
    const listConversations = useInteractor(di.getListAgentConversationsInteractor, {
      ok: true,
      data: { conversations: [], nextCursor: null },
    });
    const deleteConversation = useInteractor(di.getDeleteAgentConversationInteractor, {
      ok: true,
      data: { deleted: true },
    });
    const archiveConversation = useInteractor(di.getArchiveAgentConversationInteractor, {
      ok: true,
      data: { archived: true },
    });
    const restoreConversation = useInteractor(di.getRestoreAgentConversationInteractor, {
      ok: true,
      data: { restored: true },
    });
    const respondToApproval = useInteractor(di.getRespondToApprovalInteractor, {
      ok: true,
      data: { resolved: true },
    });
    const respondToUiCommand = useInteractor(di.getRespondToUiCommandInteractor, {
      ok: true,
      data: { resolved: true },
    });

    await expect(getAgentConversationAction(conversationId, "cursor-1")).resolves.toEqual({ messages: [] });
    await expect(listAgentConversationsAction()).resolves.toEqual({ conversations: [], nextCursor: null });
    await expect(deleteAgentConversationAction({ conversationId })).resolves.toEqual({
      ok: true,
      data: { deleted: true },
    });
    await expect(archiveAgentConversationAction({ conversationId })).resolves.toEqual({
      ok: true,
      data: { archived: true },
    });
    await expect(restoreAgentConversationAction({ conversationId })).resolves.toEqual({
      ok: true,
      data: { restored: true },
    });
    await expect(
      respondToApprovalAction({ conversationId, requestId: "request-1", decision: "approve" }),
    ).resolves.toEqual({ ok: true, data: { resolved: true } });
    await expect(
      respondToUiCommandAction({
        conversationId,
        commandId: "command-1",
        name: "navigate",
        ok: true,
        result: "Navigated.",
      }),
    ).resolves.toEqual({ ok: true, data: { resolved: true } });

    expect(getConversation).toHaveBeenCalledWith({ conversationId, before: "cursor-1" });
    expect(listConversations).toHaveBeenCalledWith({ kind: "both" });
    expect(deleteConversation).toHaveBeenCalledWith({ conversationId });
    expect(archiveConversation).toHaveBeenCalledWith({ conversationId });
    expect(restoreConversation).toHaveBeenCalledWith({ conversationId });
    expect(respondToApproval).toHaveBeenCalledWith({
      conversationId,
      requestId: "request-1",
      decision: "approve",
    });
    expect(respondToUiCommand).toHaveBeenCalledWith({
      conversationId,
      commandId: "command-1",
      name: "navigate",
      ok: true,
      result: "Navigated.",
    });
  });
});
