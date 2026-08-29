import type { AgentActivityDescriptor, AgentActivityResource } from "./agent-activity";
import type { AgentMessagePart } from "./agent-chat.schema";

import { AgentVisibleTextStreamSanitizer } from "./agent-output-safety";

export type AgentActivityStatus = "done" | "error" | "cancelled";
export type AgentApprovalStatus = "approved" | "rejected" | "timeout" | "cancelled";

export type AgentTranscriptEvent =
  | { type: "delta"; payload: { text: string } }
  | {
      type: "activity";
      payload: { id: string; activity: AgentActivityDescriptor };
    }
  | { type: "activity_superseded"; payload: { id: string } }
  | {
      type: "activity_result";
      payload: { id: string; isError: boolean; status?: AgentActivityStatus };
    }
  | {
      type: "approval_request";
      payload: { requestId: string; activity: AgentActivityDescriptor };
    }
  | {
      type: "approval_resolved";
      payload: { requestId: string; decision: string };
    };

export type AgentTranscriptEmit = (event: AgentTranscriptEvent) => void;

export class AgentTurnTranscript {
  private readonly parts: AgentMessagePart[] = [];
  private readonly toolParts = new Map<string, Extract<AgentMessagePart, { type: "activity" }>>();
  private readonly approvalParts = new Map<string, Extract<AgentMessagePart, { type: "approval" }>>();
  private readonly retryableFailureByTool = new Map<string, string>();
  private readonly affected = new Set<AgentActivityResource>();
  private sanitizer = new AgentVisibleTextStreamSanitizer();
  private text = "";

  constructor(private readonly emit: AgentTranscriptEmit) {}

  get replyParts(): AgentMessagePart[] {
    return this.parts;
  }

  get replyText() {
    return this.text;
  }

  get affectedResources() {
    return Array.from(this.affected);
  }

  get hasSuccessfulMutation() {
    return this.parts.some(
      (part) => part.type === "activity" && part.status === "done" && part.activity.risk !== "read",
    );
  }

  appendText(text: string) {
    if (!text) return;
    this.text += text;
    const last = this.parts.at(-1);
    if (last?.type === "text") last.text += text;
    else this.parts.push({ type: "text", text });
    this.emit({ type: "delta", payload: { text } });
  }

  pushTextDelta(delta: string) {
    this.appendText(this.sanitizer.push(delta));
  }

  finishTextSegment() {
    this.appendText(this.sanitizer.finish());
    this.sanitizer = new AgentVisibleTextStreamSanitizer();
  }

  beginToolCall(call: { toolCallId: string; toolName: string; activity: AgentActivityDescriptor }) {
    this.finishTextSegment();

    const supersededId = this.retryableFailureByTool.get(call.toolName);
    if (supersededId) {
      this.retryableFailureByTool.delete(call.toolName);
      const superseded = this.toolParts.get(supersededId);
      const index = superseded ? this.parts.indexOf(superseded) : -1;
      if (index >= 0) this.parts.splice(index, 1);
      this.toolParts.delete(supersededId);
      this.emit({ type: "activity_superseded", payload: { id: supersededId } });
    }

    const toolPart: Extract<AgentMessagePart, { type: "activity" }> = {
      type: "activity",
      id: call.toolCallId,
      activity: call.activity,
      status: "running",
    };
    this.toolParts.set(call.toolCallId, toolPart);
    this.parts.push(toolPart);
    this.emit({
      type: "activity",
      payload: { id: call.toolCallId, activity: call.activity },
    });
  }

  completeToolCall(result: { toolCallId: string; toolName?: string; status: AgentActivityStatus; failed: boolean }) {
    if (result.failed && result.toolName) this.retryableFailureByTool.set(result.toolName, result.toolCallId);
    this.settleTool(result.toolCallId, result.status);
    this.emit({
      type: "activity_result",
      payload: {
        id: result.toolCallId,
        isError: result.failed,
        status: result.status,
      },
    });
  }

  failToolCall(toolCallId: string) {
    this.settleTool(toolCallId, "error");
    this.emit({
      type: "activity_result",
      payload: { id: toolCallId, isError: true },
    });
  }

  failUnfinishedTools(status: Extract<AgentActivityStatus, "error" | "cancelled">, shouldEmit: boolean) {
    for (const [id, toolPart] of this.toolParts) {
      if (toolPart.status !== "running") continue;
      this.settleTool(id, status);
      if (shouldEmit) this.emit({ type: "activity_result", payload: { id, isError: true, status } });
    }
  }

  beginApproval(requestId: string, activity: AgentActivityDescriptor) {
    const approvalPart: Extract<AgentMessagePart, { type: "approval" }> = {
      type: "approval",
      id: requestId,
      activity,
      status: "pending",
    };
    this.approvalParts.set(requestId, approvalPart);
    this.parts.push(approvalPart);
    this.emit({ type: "approval_request", payload: { requestId, activity } });
  }

  resolveApproval(requestId: string, status: AgentApprovalStatus, decision: string) {
    const approvalPart = this.approvalParts.get(requestId);
    if (approvalPart) approvalPart.status = status;
    this.emit({ type: "approval_resolved", payload: { requestId, decision } });
  }

  private settleTool(toolCallId: string, status: AgentActivityStatus) {
    const toolPart = this.toolParts.get(toolCallId);
    if (!toolPart) return;
    toolPart.status = status;
    if (status === "done" && toolPart.activity.risk !== "read")
      toolPart.activity.affectedResources.forEach((resource) => this.affected.add(resource));
  }
}
