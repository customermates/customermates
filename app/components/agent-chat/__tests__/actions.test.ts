import { describe, expect, it, vi } from "vitest";

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

vi.mock("@/env", () => ({
  env: { AGENT_CHAT_DISABLED: true },
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

describe("agent server action kill switch", () => {
  it("returns a stable disabled code for configuration without invoking its interactor", async () => {
    const result = await getAgentConfigAction();

    expect(result).toMatchObject({ ok: false, code: "agentChatDisabled" });
    expect(di.getGetAgentConfigInteractor).not.toHaveBeenCalled();
  });

  it("rejects every remaining action before dependency injection", async () => {
    const actions = [
      () => getAgentConversationAction(conversationId),
      () => listAgentConversationsAction(),
      () => deleteAgentConversationAction({ conversationId }),
      () => archiveAgentConversationAction({ conversationId }),
      () => restoreAgentConversationAction({ conversationId }),
      () => respondToApprovalAction({ conversationId, requestId: "request-1", decision: "approve" }),
      () =>
        respondToUiCommandAction({
          conversationId,
          commandId: "command-1",
          name: "navigate",
          ok: true,
          result: "Navigated.",
        }),
    ];

    for (const action of actions) await expect(action()).rejects.toThrow("The Assistant is unavailable.");
    for (const getter of Object.values(di)) expect(getter).not.toHaveBeenCalled();
  });
});
