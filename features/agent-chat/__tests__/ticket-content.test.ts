import { describe, it, expect, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import {
  buildTicketContentFromTranscript,
  TRANSCRIPT_FALLBACK_BODY,
  TRANSCRIPT_FALLBACK_SUBJECT,
} from "../agent-chat.schema";

const message = (role: string, text: string) => ({ role, parts: [{ type: "text", text }] });

describe("buildTicketContentFromTranscript", () => {
  it("derives the subject from the first transcript line and keeps the full transcript as the body", () => {
    const result = buildTicketContentFromTranscript([
      message("user", "How do I import contacts?"),
      message("assistant", "You can use the CSV importer."),
    ]);

    expect(result.subject).toBe("user: How do I import contacts?");
    expect(result.body).toContain("assistant: You can use the CSV importer.");
  });

  it("never returns an empty subject or body when there is no transcript", () => {
    const result = buildTicketContentFromTranscript([]);

    expect(result.subject).toBe(TRANSCRIPT_FALLBACK_SUBJECT);
    expect(result.body).toBe(TRANSCRIPT_FALLBACK_BODY);
  });

  it("never returns an empty subject when every message has no text", () => {
    const result = buildTicketContentFromTranscript([
      { role: "user", parts: [] },
      { role: "assistant", parts: [{ type: "tool_use", name: "list_records" }] },
    ]);

    expect(result.subject).toBe(TRANSCRIPT_FALLBACK_SUBJECT);
    expect(result.body).toBe(TRANSCRIPT_FALLBACK_BODY);
  });

  it("truncates a long first line to the kernel's 200 character subject limit", () => {
    const result = buildTicketContentFromTranscript([message("user", "x".repeat(400))]);

    expect(result.subject).toHaveLength(200);
  });

  it("labels human support explicitly and redacts legacy internal output", () => {
    const result = buildTicketContentFromTranscript([
      message("user", '<page_context route="/en/dashboard"/>\nPlease help'),
      message("support", "A human reviewed 00000000-0000-4000-8000-000000000001. apiKey=never-show"),
      message("provider", "modelId=gpt-5.6-luna; inputTokens=321"),
    ]);

    expect(result.body).toContain("Customermates human support:");
    expect(result.body).toContain("assistant:");
    expect(result.body).not.toMatch(/page_context|00000000|never-show|gpt-5\.6|inputTokens|321/);
  });
});
