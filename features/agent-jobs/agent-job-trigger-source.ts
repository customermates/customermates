import type { AutomationRuleRepo } from "@/features/automation-rules/automation-rule.repo";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { AgentJobMessageRef } from "./agent-job-prompt";

import { z } from "zod";

import { MESSAGE_RULE_EVENTS } from "@/features/automation-rules/automation-event";
import { EXTERNAL_TRIGGER_EVENTS } from "@/features/event/external-trigger-events";
import { isOutsideRecordWrite, isUntrustedAgentRecordWrite } from "@/features/records/record-event-cause";

const LINKED_RECORD_LIMIT = 5;
const RULE_HOP_LIMIT = 5;
const RULE_EFFECT_CAUSE = /^rule:([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?::|$)/;

const RunPayloadSchema = z.looseObject({ eventId: z.string().min(1) });
const MessageEventSchema = z.looseObject({ threadId: z.uuid() });

type TriggerEvent = {
  kind: string;
  subjectId: string | null;
  payload: unknown;
  via?: unknown;
  causeId?: string | null;
};

export type AgentJobTriggerEvents = {
  findUnscoped(companyId: string, eventId: string): Promise<TriggerEvent | null>;
};

export type AgentJobThreadRecords = {
  canAccessThread(threadId: string): Promise<boolean>;
  listLinks(threadId: string, take: number): Promise<RecordRef[]>;
};

export type AgentJobTrigger = { outside: boolean; message: AgentJobMessageRef | null };

export type AgentJobTriggerSource = {
  triggerOf(args: { companyId: string; runId: string }): Promise<AgentJobTrigger>;
};

function isMessageEvent(event: TriggerEvent): boolean {
  return (MESSAGE_RULE_EVENTS as readonly string[]).includes(event.kind);
}

function cameFromOutside(event: TriggerEvent): boolean {
  return (
    isMessageEvent(event) ||
    (EXTERNAL_TRIGGER_EVENTS as readonly string[]).includes(event.kind) ||
    isOutsideRecordWrite(event.via) ||
    isUntrustedAgentRecordWrite(event.payload)
  );
}

export class AutomationRunTriggerSource implements AgentJobTriggerSource {
  constructor(
    private readonly runs: Pick<AutomationRuleRepo, "findRunUnscoped">,
    private readonly events: AgentJobTriggerEvents,
    private readonly threads: AgentJobThreadRecords,
  ) {}

  async triggerOf(args: { companyId: string; runId: string }): Promise<AgentJobTrigger> {
    const event = await this.eventOf(args.companyId, args.runId);
    if (!event) return { outside: false, message: null };
    return {
      outside: await this.startedOutside(args.companyId, event),
      message: await this.messageOf(event),
    };
  }

  private async eventOf(companyId: string, runId: string): Promise<TriggerEvent | null> {
    const found = await this.runs.findRunUnscoped(companyId, runId);
    const run = RunPayloadSchema.safeParse(found?.run.payload);
    return run.success ? this.events.findUnscoped(companyId, run.data.eventId) : null;
  }

  private async startedOutside(companyId: string, trigger: TriggerEvent): Promise<boolean> {
    let event: TriggerEvent | null = trigger;
    for (let hop = 0; event && hop <= RULE_HOP_LIMIT; hop += 1) {
      if (cameFromOutside(event)) return true;
      const writingRun = RULE_EFFECT_CAUSE.exec(event.causeId ?? "")?.[1];
      if (!writingRun) return false;
      event = await this.eventOf(companyId, writingRun);
    }
    return false;
  }

  private async messageOf(event: TriggerEvent): Promise<AgentJobMessageRef | null> {
    if (!isMessageEvent(event)) return null;
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
