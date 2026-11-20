import type { AgentJobFinishReason, AgentTranscriptEvent } from "@/features/agent-jobs/agent-job.schema";

import {
  AGENT_JOB_SUMMARY_MAX_CHARS,
  AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS,
} from "@/features/agent-jobs/agent-job.schema";
import { clipText, storableText } from "@/features/agent-jobs/agent-job-text";

function clip(text: string, max: number): string {
  const flat = storableText(text).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${clipText(flat, max - 1)}…` : flat;
}

export class AgentJobRecorder {
  toolCalls = 0;
  readonly loadedToolsets = new Set<string>();
  private pending: AgentTranscriptEvent[] = [];

  constructor(private readonly clock: () => Date = () => new Date()) {}

  private at(): string {
    return this.clock().toISOString();
  }

  message(role: "user" | "assistant", text: string): void {
    this.pending.push({
      type: "message",
      at: this.at(),
      role,
      text: clipText(text, AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS),
    });
  }

  toolCall(toolCallId: string, name: string, input: unknown): void {
    this.pending.push({
      type: "toolCall",
      at: this.at(),
      toolCallId,
      name,
      argumentsDigest: clip(safeJson(input), AGENT_JOB_SUMMARY_MAX_CHARS),
    });
  }

  toolResult(toolCallId: string, name: string, ok: boolean, summary: string): void {
    this.pending.push({
      type: "toolResult",
      at: this.at(),
      toolCallId,
      name,
      ok,
      summary: clip(summary, AGENT_JOB_SUMMARY_MAX_CHARS),
    });
  }

  finish(reason: AgentJobFinishReason, text?: string): void {
    this.pending.push({
      type: "finish",
      at: this.at(),
      reason,
      ...(text ? { text: clipText(text, AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS) } : {}),
    });
  }

  drain(): AgentTranscriptEvent[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}
