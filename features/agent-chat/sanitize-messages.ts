import type { UIMessage } from "ai";

// convertToModelMessages emits NEITHER a tool_use nor a tool_result for an
// input-streaming part, so those are safe to drop outright.
const DROP_TOOL_STATES = new Set(["input-streaming"]);

// These states emit a tool_use with NO paired tool_result, which Anthropic rejects
// (HTTP 400 "tool_use ids ... without tool_result"). We rewrite them to a synthetic
// output-error so the tool_use keeps a paired tool_result. We deliberately do NOT
// touch "approval-responded": an approved-but-not-yet-executed call is finished by
// streamText in the same turn, and a rejection converts to output-denied — both
// already pair correctly, so repairing them would break the approval flow.
const ORPHAN_TOOL_STATES = new Set(["input-available", "approval-requested"]);

function isToolPart(part: { type?: string }): boolean {
  return typeof part.type === "string" && (part.type.startsWith("tool-") || part.type === "dynamic-tool");
}

/**
 * Guarantees every assistant tool_use we forward to the model has a matching
 * tool_result. convertToModelMessages emits a tool_use for any tool part that is
 * not input-streaming, but only emits a tool_result for resolved/denied/errored
 * parts (and approval responses). A part left at input-available (e.g. a client UI
 * tool whose result never came back) or approval-requested (the user moved on
 * without deciding) becomes a dangling tool_use that aborts the whole turn.
 *
 * This repairs the WHOLE history (not just the tail): orphan tool parts are
 * rewritten in place to an output-error (which DOES emit a paired tool_result),
 * input-streaming parts are dropped, and an assistant message left with no
 * model-visible content is removed. Resolved calls, approval responses, text, and
 * non-assistant messages pass through untouched, so tours, creates and the
 * approval flow are unaffected.
 */
export function repairDanglingToolCalls(messages: UIMessage[]): UIMessage[] {
  const cleaned: UIMessage[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") {
      cleaned.push(message);
      continue;
    }

    let changed = false;

    const parts = message.parts
      .filter((part) => {
        if (isToolPart(part) && DROP_TOOL_STATES.has((part as { state?: string }).state ?? "")) {
          changed = true;
          return false;
        }
        return true;
      })
      .map((part) => {
        if (!isToolPart(part) || !ORPHAN_TOOL_STATES.has((part as { state?: string }).state ?? "")) return part;
        changed = true;
        // Strip any pending-approval marker so the converter treats this purely as a
        // finished (errored) call rather than emitting a dangling approval request.
        const { approval, ...rest } = part as Record<string, unknown>;
        void approval;
        return {
          ...rest,
          state: "output-error",
          errorText: "Tool call was not completed (no result was produced).",
        } as unknown as (typeof message.parts)[number];
      });

    if (!changed) {
      cleaned.push(message);
      continue;
    }

    // Keep the message only if something model-visible remains (text or a tool part).
    if (parts.some((part) => part.type === "text" || isToolPart(part))) cleaned.push({ ...message, parts });
  }

  return cleaned;
}
