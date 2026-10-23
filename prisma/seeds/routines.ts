import type { RecordDeliveryEnvelope } from "@/features/records/record-delivery.schema";
import type { EventEnvelope } from "@/features/event/event-envelope";
import type { RoutineTriggerEvent } from "@/ee/routines/routine-trigger-events";
import type { Prisma, PrismaClient } from "@/generated/prisma";

import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";
import { RecordEventPayloadSchema } from "@/features/records/record-event.schema";
import {
  AgentConversationOrigin,
  AgentTurnTerminalCode,
  RoutineRunStatus,
  RoutineTriggerKind,
} from "@/generated/prisma";
import { composeRoutinePrompt } from "@/ee/routines/routine-prompt";
import { nextCronOccurrence, parseCronExpression } from "@/ee/routines/routine-schedule";
import { agentCreditsToMicrocents } from "@/core/commercial/agent-credits";

import { upsertFixturesById, workspaceFixtureId } from "./helpers";
import { SYNTHETIC_COMPANY_MEMBER_DEFINITIONS } from "./members";
import { routinePrompt } from "./record-routine-prompts";
import { seedRecordEventSubscription } from "./record-event-subscriptions";
import type { MemberKey, RoutineSpec, SolutionContent } from "./solutions/define-solution";
import { solutionMemberId, type SolutionRecordData } from "./solutions/solution-data";
import { SOLUTION_WORKSPACES, TEAM_SOLUTION_WORKSPACE, type SolutionWorkspace } from "./solutions/solution-workspaces";
import { TEAM_SOLUTION_CONTENT } from "./solutions/team-workspace";
import { TEAM_MEMBER_IDS } from "./team";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const ROUTINE_TIMEZONE = "Europe/Berlin";

export const SYNTHETIC_ROUTINE_ID_PREFIX = "31000000";
export const SYNTHETIC_ROUTINE_RUN_ID_PREFIX = "32000000";
export const SYNTHETIC_ROUTINE_CONVERSATION_ID_PREFIX = "33000000";
const ROUTINE_MESSAGE_ID_PREFIX = "34000000";
const MESSAGING_EVENT_PREFIX = "2e000000";
const MESSAGING_ENTITY_PREFIX = "35000000";
const MESSAGING_THREAD_PREFIX = "17000000";

type SeedTriggerSample =
  | { kind: "record"; key: string }
  | {
      kind: "messaging";
      thread: number;
      eventId: string;
      entityId: string;
      payload: (thread: { id: string; connectedAccountId: string }) => object;
    };

type SeedTrigger =
  | { kind: "schedule"; cron: string }
  | {
      kind: "event";
      events: RoutineTriggerEvent[];
      recordTypes?: string[];
      debounceSeconds: number;
      sample?: SeedTriggerSample;
    };

type SeedRun = {
  status: RoutineRunStatus;
  startedHoursAgo: number;
  durationSeconds: number;
  chargedCredits: number;
  summary?: string;
  note?: string;
  error?: string;
};

export type SeedRoutine = {
  index: number;
  owner: MemberKey | null;
  ownerUserId: string;
  ownerName: string;
  name: string;
  prompt: string;
  enabled: boolean;
  trigger: SeedTrigger;
  runs: SeedRun[];
};

const runFailureNote = (error: string) =>
  error === "providerUnavailable"
    ? "I could not reach the model provider on this attempt, so I stopped before reading or changing anything. Nothing was modified. The next scheduled run will pick this up."
    : "I stopped before doing any work because this run would have exceeded the credit ceiling set on the routine. Nothing was read or changed.";

function nextScheduledRun(cron: string): Date | null {
  const parsed = parseCronExpression(cron);
  return parsed.ok ? nextCronOccurrence(parsed.cron, new Date(), ROUTINE_TIMEZONE) : null;
}

function memberName(workspace: SolutionWorkspace, content: SolutionContent, member: MemberKey | undefined): string {
  if (!member) return SYNTHETIC_COMPANY_USERS.maxBergmann.name;
  const colleague = content.members?.find((entry) => entry.key === member);
  if (colleague) return `${colleague.firstName} ${colleague.lastName}`;
  if (!workspace.team) return SYNTHETIC_COMPANY_USERS.maxBergmann.name;
  const id = TEAM_MEMBER_IDS[member as keyof typeof TEAM_MEMBER_IDS];
  const definition = SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.find((entry) => entry.id === id);
  if (!definition) throw new Error(`Unknown routine owner ${member}`);
  return `${definition.firstName} ${definition.lastName}`;
}

function messagingPayload(event: RoutineTriggerEvent, index: number) {
  return (thread: { id: string; connectedAccountId: string }, account: string) =>
    event === "messaging.relation.created"
      ? {
          connectedAccountId: thread.connectedAccountId,
          provider: account,
          providerUserId: `demo-provider-user-${index}`,
        }
      : {
          connectedAccountId: thread.connectedAccountId,
          provider: account,
          providerMessageId: `demo-provider-message-${index}`,
          threadId: thread.id,
        };
}

/** The seeded routines of a workspace with their owners, prompts and runs, in the order of its content. */
export function solutionSeedRoutines(workspace: SolutionWorkspace, content: SolutionContent): SeedRoutine[] {
  return (content.routines ?? []).map((spec: RoutineSpec, position) => {
    const index = position + 1;
    const trigger: SeedTrigger =
      spec.trigger.kind === "schedule"
        ? { kind: "schedule", cron: spec.trigger.cron }
        : (() => {
            const { events, lists, debounceSeconds, sample } = spec.trigger;
            const [event] = events;
            const account =
              sample && "thread" in sample ? content.messaging?.threads[sample.thread]?.account : undefined;
            if (sample && "thread" in sample && !account)
              throw new Error(`${workspace.slug}: routine ${spec.key} samples an unknown conversation`);
            const payload = messagingPayload(event, index);
            return {
              kind: "event",
              events: [...events],
              ...(lists?.length ? { recordTypes: [...lists] } : {}),
              debounceSeconds,
              ...(sample
                ? {
                    sample:
                      "record" in sample
                        ? { kind: "record" as const, key: sample.record }
                        : {
                            kind: "messaging" as const,
                            thread: sample.thread,
                            eventId: workspaceFixtureId(MESSAGING_EVENT_PREFIX, workspace.tag, index),
                            entityId: workspaceFixtureId(MESSAGING_ENTITY_PREFIX, workspace.tag, index),
                            payload: (thread: { id: string; connectedAccountId: string }) =>
                              payload(thread, account ?? "google"),
                          },
                  }
                : {}),
            };
          })();
    return {
      index,
      owner: spec.owner ?? null,
      ownerUserId: solutionMemberId(workspace, spec.owner),
      ownerName: memberName(workspace, content, spec.owner),
      name: spec.name,
      prompt: routinePrompt(spec.task),
      enabled: spec.enabled ?? true,
      trigger,
      runs: spec.runs.map((run) => ({
        status: RoutineRunStatus[run.status],
        startedHoursAgo: run.startedHoursAgo,
        durationSeconds: run.durationSeconds,
        chargedCredits: run.credits,
        ...(run.summary === undefined ? {} : { summary: run.summary }),
        ...(run.note === undefined ? {} : { note: run.note }),
        ...(run.error === undefined ? {} : { error: run.error }),
      })),
    };
  });
}

/** The routines of the small-business team workspace. */
export const SYNTHETIC_ROUTINES = solutionSeedRoutines(TEAM_SOLUTION_WORKSPACE, TEAM_SOLUTION_CONTENT);

async function recordSample(
  prisma: PrismaClient,
  workspace: SolutionWorkspace,
  data: SolutionRecordData,
  key: string,
  event: string,
): Promise<RecordDeliveryEnvelope> {
  const { companyId } = workspace;
  const ref = data.ids.get(key);
  if (!ref) throw new Error(`${workspace.slug}: routine sample ${key} is no record`);
  const row = await prisma.eventLog.findFirst({
    where: { companyId, subjectKind: "record", subjectTypeId: ref.typeId, subjectId: ref.recordId, kind: event },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  if (!row) throw new Error(`${workspace.slug}: routine sample ${key} has no ${event} event`);
  const payload = RecordEventPayloadSchema.parse(row.payload);
  const value = (entry: (typeof payload.fields)[number]["before"]) =>
    entry && {
      fieldId: entry.fieldId,
      label: entry.label,
      valueType: entry.valueType,
      format: entry.format,
      options: entry.options,
      value: entry.value,
    };
  return {
    event: event as RecordDeliveryEnvelope["event"],
    id: row.id,
    timestamp: row.createdAt.toISOString(),
    companyId,
    actorId: row.actorId,
    data: {
      causeId: row.causeId,
      cause: payload.cause,
      record: {
        ref: payload.ref,
        schemaRevision: payload.schemaRevision,
        beforeVersion: payload.beforeVersion,
        afterVersion: payload.afterVersion,
        assignments: payload.assignments,
        identities: payload.identities,
        links: payload.links,
        related: [],
        fields: payload.fields.map(({ fieldId, before, after }) => ({
          fieldId,
          before: value(before),
          after: value(after),
        })),
      },
    },
  };
}

async function triggerSample(
  prisma: PrismaClient,
  workspace: SolutionWorkspace,
  data: SolutionRecordData,
  trigger: SeedTrigger,
): Promise<{ entityId: string; triggerPayload: EventEnvelope } | null> {
  if (trigger.kind !== "event" || !trigger.sample) return null;
  const [event] = trigger.events;
  const { sample } = trigger;
  if (sample.kind === "record") {
    const envelope = await recordSample(prisma, workspace, data, sample.key, event);
    return { entityId: envelope.data.record.ref.recordId, triggerPayload: envelope };
  }
  const thread = await prisma.messagingThread.findFirst({
    where: {
      companyId: workspace.companyId,
      id: workspaceFixtureId(MESSAGING_THREAD_PREFIX, workspace.tag, sample.thread + 1),
    },
    select: { id: true, connectedAccountId: true, createdAt: true },
  });
  if (!thread) throw new Error(`${workspace.slug}: routine sample conversation ${sample.thread} is missing`);
  return {
    entityId: sample.entityId,
    triggerPayload: {
      event,
      id: sample.eventId,
      timestamp: thread.createdAt.toISOString(),
      companyId: workspace.companyId,
      actorId: null,
      data: { entityId: sample.entityId, ...sample.payload(thread) },
    },
  };
}

/**
 * Seeds a workspace's routines with their record subscriptions, run history and run transcripts, and removes the
 * routines, runs and transcripts it no longer has. Run times are relative to the seed run, so the history stays recent.
 */
export async function seedSolutionRoutines(
  prisma: PrismaClient,
  workspace: SolutionWorkspace,
  content: SolutionContent,
  data: SolutionRecordData,
): Promise<void> {
  const { companyId, tag } = workspace;
  const now = Date.now();
  const ordinal = SOLUTION_WORKSPACES.indexOf(workspace);
  const routines = solutionSeedRoutines(workspace, content);
  const routineId = (index: number) => workspaceFixtureId(SYNTHETIC_ROUTINE_ID_PREFIX, tag, index);
  const runId = (index: number, run: number) =>
    workspaceFixtureId(SYNTHETIC_ROUTINE_RUN_ID_PREFIX, tag, index * 100 + run);
  const conversationId = (index: number, run: number) =>
    workspaceFixtureId(SYNTHETIC_ROUTINE_CONVERSATION_ID_PREFIX, tag, index * 100 + run);
  const messageId = (index: number, run: number, message: number) =>
    workspaceFixtureId(ROUTINE_MESSAGE_ID_PREFIX, tag, index * 10000 + run * 100 + message);

  const routineIds = routines.map(({ index }) => routineId(index));
  const runIds = routines.flatMap((routine) => routine.runs.map((_run, run) => runId(routine.index, run)));
  const conversationIds = routines.flatMap((routine) =>
    routine.runs.map((_run, run) => conversationId(routine.index, run)),
  );
  await prisma.routineRun.deleteMany({
    where: { companyId, id: { startsWith: `${SYNTHETIC_ROUTINE_RUN_ID_PREFIX}-${tag}-`, notIn: runIds } },
  });
  await prisma.agentConversation.deleteMany({
    where: {
      companyId,
      origin: AgentConversationOrigin.routine,
      id: { startsWith: `${SYNTHETIC_ROUTINE_CONVERSATION_ID_PREFIX}-${tag}-`, notIn: conversationIds },
    },
  });
  const retired = await prisma.routine.findMany({
    where: { companyId, id: { startsWith: `${SYNTHETIC_ROUTINE_ID_PREFIX}-${tag}-`, notIn: routineIds } },
    select: { id: true },
  });
  await prisma.recordEventSubscription.deleteMany({ where: { companyId, id: { in: retired.map(({ id }) => id) } } });
  await prisma.routine.deleteMany({ where: { companyId, id: { in: retired.map(({ id }) => id) } } });

  await upsertFixturesById(
    routines.map((routine) => ({ id: routineId(routine.index), routine })),
    async ({ id, routine }) => {
      const schedule = routine.trigger.kind === "schedule" ? routine.trigger : undefined;
      const event = routine.trigger.kind === "event" ? routine.trigger : undefined;
      const lastRun = routine.runs.at(0);
      const sample = await triggerSample(prisma, workspace, data, routine.trigger);
      const triggerPayload = sample?.triggerPayload ?? null;

      await seedRecordEventSubscription(prisma, companyId, {
        id,
        kind: "routine",
        ownerUserId: routine.ownerUserId,
        events: event?.events ?? [],
        recordTypes: event?.recordTypes ?? [],
        enabled: routine.enabled,
      });
      const row = {
        companyId,
        ownerUserId: routine.ownerUserId,
        name: routine.name,
        prompt: routine.prompt,
        enabled: routine.enabled,
        triggerKind: schedule ? RoutineTriggerKind.schedule : RoutineTriggerKind.event,
        cronExpression: schedule?.cron ?? null,
        timezone: schedule ? ROUTINE_TIMEZONE : null,
        triggerEvents: event?.events ?? [],
        triggerFilters: undefined,
        debounceSeconds: event?.debounceSeconds ?? 300,
        nextRunAt: schedule && routine.enabled ? nextScheduledRun(schedule.cron) : null,
        lastRunAt: lastRun ? new Date(now - lastRun.startedHoursAgo * HOUR) : null,
        lastRunStatus: lastRun?.status ?? null,
        disabledReason: null,
        createdAt: new Date(now - (120 - routine.index * 17) * 24 * HOUR),
        updatedAt: new Date(now - (100 - routine.index * 17) * 24 * HOUR),
      };
      await prisma.routine.upsert({ where: { id }, create: { id, ...row }, update: row });

      await upsertFixturesById(
        routine.runs.map((run, runIndex) => ({ id: runId(routine.index, runIndex), run, runIndex })),
        async ({ id: routineRunId, run, runIndex }) => {
          const startedAt = new Date(now - run.startedHoursAgo * HOUR);
          const finishedAt = new Date(startedAt.getTime() + run.durationSeconds * 1000);
          const conversation = conversationId(routine.index, runIndex);
          const conversationRow = {
            companyId,
            userId: routine.ownerUserId,
            origin: AgentConversationOrigin.routine,
            title: routine.name,
            archivedAt: null,
            selectedAt: null,
            createdAt: startedAt,
            updatedAt: finishedAt,
          };
          await prisma.agentConversation.upsert({
            where: { id: conversation },
            create: { id: conversation, ...conversationRow },
            update: conversationRow,
          });
          const transcript = [
            {
              role: "user" as const,
              text: composeRoutinePrompt(routine.prompt, {
                routineName: routine.name,
                triggerEvent: event?.events[0] ?? null,
                triggerEntityId: sample?.entityId ?? null,
                triggerPayload,
              }),
            },
            { role: "assistant" as const, text: run.summary ?? run.note ?? runFailureNote(run.error ?? "") },
          ];
          for (const [messageIndex, message] of transcript.entries()) {
            const id = messageId(routine.index, runIndex, messageIndex);
            const messageRow = {
              conversationId: conversation,
              companyId,
              role: message.role,
              parts: [{ type: "text", text: message.text }] as Prisma.InputJsonValue,
              sequence: BigInt(500_000 + ordinal * 10_000 + routine.index * 1_000 + runIndex * 10 + messageIndex),
              createdAt: new Date(startedAt.getTime() + messageIndex * 1_000),
            };
            await prisma.agentMessage.upsert({ where: { id }, create: { id, ...messageRow }, update: messageRow });
          }
          const runRow = {
            companyId,
            routineId: id,
            executedByUserId: routine.ownerUserId,
            executedByName: routine.ownerName,
            status: run.status,
            triggerKind: schedule ? RoutineTriggerKind.schedule : RoutineTriggerKind.event,
            triggerEvent: event?.events[0] ?? null,
            conversationId: conversation,
            triggerEntityId: sample?.entityId ?? null,
            triggerPayload: (triggerPayload ?? undefined) as Prisma.InputJsonValue | undefined,
            scheduledFor: startedAt,
            startedAt,
            finishedAt,
            terminalCode: run.status === RoutineRunStatus.succeeded ? AgentTurnTerminalCode.completed : null,
            chargedMicrocents: agentCreditsToMicrocents(run.chargedCredits),
            summary: run.summary ?? null,
            error: run.error ?? null,
          };
          await prisma.routineRun.upsert({
            where: { id: routineRunId },
            create: { id: routineRunId, ...runRow },
            update: runRow,
          });
        },
      );
    },
  );
}
