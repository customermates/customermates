import type { AutomationRuleRepo } from "@/features/automation-rules/automation-rule.repo";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { AgentJobMessageRef } from "./agent-job-prompt";

import { z } from "zod";

import { MESSAGE_RULE_EVENTS } from "@/features/automation-rules/automation-event";

const LINKED_RECORD_LIMIT = 5;

const RunPayloadSchema = z.looseObject({ eventId: z.string().min(1) });
const MessageEventSchema = z.looseObject({ threadId: z.uuid() });

type TriggerEvent = { kind: string; subjectId: string | null; payload: unknown };

export type AgentJobTriggerEvents = {
  findUnscoped(companyId: string, eventId: string): Promise<TriggerEvent | null>;
};

export type AgentJobThreadRecords = {
  canAccessThread(threadId: string): Promise<boolean>;
  listLinks(threadId: string, take: number): Promise<RecordRef[]>;
};

export type AgentJobTriggerSource = {
  messageOf(args: { companyId: string; runId: string }): Promise<AgentJobMessageRef | null>;
};

export class AutomationRunTriggerSource implements AgentJobTriggerSource {
  constructor(
    private readonly runs: Pick<AutomationRuleRepo, "findRunUnscoped">,
    private readonly events: AgentJobTriggerEvents,
    private readonly threads: AgentJobThreadRecords,
  ) {}

  async messageOf(args: { companyId: string; runId: string }): Promise<AgentJobMessageRef | null> {
    const found = await this.runs.findRunUnscoped(args.companyId, args.runId);
    const run = RunPayloadSchema.safeParse(found?.run.payload);
    if (!run.success) return null;
    const event = await this.events.findUnscoped(args.companyId, run.data.eventId);
    if (!event || !(MESSAGE_RULE_EVENTS as readonly string[]).includes(event.kind)) return null;
    const message = MessageEventSchema.safeParse(event.payload);
    if (!message.success) return null;
    const { threadId } = message.data;
    return {
      threadId,
      messageId: event.subjectId,
      channel: event.kind === "messaging.email.received" ? "email" : "chat",
      records: (await this.threads.canAccessThread(threadId))
        ? await this.threads.listLinks(threadId, LINKED_RECORD_LIMIT)
        : [],
    };
  }
}
