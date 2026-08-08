import { describe, expect, it } from "vitest";

import { deriveChatSupportTicketId } from "../agent-support-ticket-idempotency";

describe("hosted-agent support ticket identity", () => {
  it("derives one stable RFC UUID from the turn and tool-call identity", () => {
    const input = {
      turnRequestId: "00000000-0000-4000-8000-000000000001",
      toolCallId: "call_request_support_1",
    };

    const first = deriveChatSupportTicketId(input);

    expect(deriveChatSupportTicketId(input)).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("domain-separates different turn and tool-call pairs", () => {
    const base = {
      turnRequestId: "00000000-0000-4000-8000-000000000001",
      toolCallId: "call_request_support_1",
    };

    expect(deriveChatSupportTicketId({ ...base, toolCallId: "call_request_support_2" })).not.toBe(
      deriveChatSupportTicketId(base),
    );
    expect(deriveChatSupportTicketId({ ...base, turnRequestId: "00000000-0000-4000-8000-000000000002" })).not.toBe(
      deriveChatSupportTicketId(base),
    );
  });
});
