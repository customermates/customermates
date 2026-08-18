import { describe, it, expect, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { formatSupportTranscript, SUPPORT_TRANSCRIPT_LINE_MAX_CHARS } from "../agent-chat.schema";

const message = (role: string, text: string) => ({ role, parts: [{ type: "text", text }] });

describe("formatSupportTranscript", () => {
  it("labels each side and keeps the exchange in order", () => {
    const transcript = formatSupportTranscript([
      message("user", "How do I import contacts?"),
      message("assistant", "You can use the CSV importer."),
    ]);

    expect(transcript).toBe("user: How do I import contacts?\nassistant: You can use the CSV importer.");
  });

  it("returns nothing when there is no transcript to send", () => {
    expect(formatSupportTranscript([])).toBe("");
  });

  it("drops messages that carry no readable text", () => {
    const transcript = formatSupportTranscript([
      { role: "user", parts: [] },
      { role: "assistant", parts: [{ type: "tool_use", name: "list_records" }] },
      message("user", "Still stuck"),
    ]);

    expect(transcript).toBe("user: Still stuck");
  });

  it("truncates a very long message rather than mailing the whole thing", () => {
    const transcript = formatSupportTranscript([message("user", "x".repeat(4000))]);

    expect(transcript).toHaveLength("user: ".length + SUPPORT_TRANSCRIPT_LINE_MAX_CHARS);
  });

  it("redacts internal output and the legacy page-context marker before it leaves the product", () => {
    const transcript = formatSupportTranscript([
      message("user", '<page_context route="/en/dashboard"/>\nPlease help'),
      message("assistant", "I looked at 00000000-0000-4000-8000-000000000001. apiKey=never-show"),
      message("provider", "modelId=gpt-5.6-luna; inputTokens=321"),
    ]);

    expect(transcript).toContain("user: Please help");
    expect(transcript).not.toMatch(/page_context|00000000|never-show|gpt-5\.6|inputTokens|321/);
  });
});
