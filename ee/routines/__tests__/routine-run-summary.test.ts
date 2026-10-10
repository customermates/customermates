import { describe, expect, it } from "vitest";

import { RoutineRunStatus } from "@/generated/prisma";
import { AgentVisibleTextStreamSanitizer } from "@/ee/agent-chat/agent-output-safety";
import {
  ROUTINE_SUMMARY_MAX_CHARS,
  routineRunDetail,
  summarizeAssistantParts,
} from "@/ee/routines/routine-run-outcome";

const RECORD_ID = "80000000-0000-4000-8000-000000000003";
const t = (key: string) => key;

function storedAssistantText(value: string) {
  const sanitizer = new AgentVisibleTextStreamSanitizer();
  return `${sanitizer.push(value)}${sanitizer.finish()}`;
}

describe("routine run summary", () => {
  it("names a linked record by its label, never its route or id", () => {
    const text = storedAssistantText(
      `I updated **[CRM Rollout](/records/60000000-0000-4000-8000-000000000002/${RECORD_ID})** and [Roche](/inbox?threadId=${RECORD_ID}).`,
    );

    expect(text).toContain(`(/records/60000000-0000-4000-8000-000000000002/${RECORD_ID})`);
    expect(summarizeAssistantParts([{ type: "text", text }])).toBe("I updated CRM Rollout and Roche.");
  });

  it("shows a stored summary that still holds a record link as plain text", () => {
    const run = {
      status: RoutineRunStatus.succeeded,
      summary: `I updated [CRM Rollout](/records/60000000-0000-4000-8000-000000000002/${RECORD_ID}).`,
      error: null,
    };

    expect(routineRunDetail(run, t)).toBe("I updated CRM Rollout.");
  });

  it("keeps the summary limit after turning the answer into plain text", () => {
    const summary = summarizeAssistantParts([
      {
        type: "text",
        text: `[CRM Rollout](/records/60000000-0000-4000-8000-000000000002/${RECORD_ID}) ${"note ".repeat(100)}`,
      },
    ]);

    expect(summary?.startsWith("CRM Rollout note note")).toBe(true);
    expect(summary).toHaveLength(ROUTINE_SUMMARY_MAX_CHARS);
    expect(summary?.endsWith("…")).toBe(true);
  });
});
