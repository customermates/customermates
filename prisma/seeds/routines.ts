import { recordRoutinePrompt } from "./record-routine-prompts";
import { seedRecordEventSubscription } from "./record-event-subscriptions";
import { presetId } from "@/features/records/crm-preset";
import { RecordEventPayloadSchema } from "@/features/records/record-event.schema";
import type { RecordDeliveryEnvelope } from "@/features/records/record-delivery.schema";
import type { RoutineTriggerEvent } from "@/ee/routines/routine-trigger-events";
import type { SeedContext } from "./context";
import type { SyntheticRecordType } from "./custom-fields";

import type { Prisma } from "@/generated/prisma";
import {
  AgentConversationOrigin,
  AgentTurnTerminalCode,
  RoutineRunStatus,
  RoutineTriggerKind,
} from "@/generated/prisma";

import { composeRoutinePrompt } from "@/ee/routines/routine-prompt";
import { nextCronOccurrence, parseCronExpression } from "@/ee/routines/routine-schedule";
import { fixtureId, upsertFixturesById } from "./helpers";
import { agentCreditsToMicrocents } from "@/core/commercial/agent-credits";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function nextScheduledRun(cron: string): Date | null {
  const parsed = parseCronExpression(cron);
  return parsed.ok ? nextCronOccurrence(parsed.cron, new Date(), ROUTINE_TIMEZONE) : null;
}

export const ROUTINE_TIMEZONE = "Europe/Berlin";

type SeedOwner = "user" | "sofiaRossiUser" | "elenaHoffmannUser";

type SyntheticRecordEventKey = `${SyntheticRecordType}:${number}:${"record.created" | "record.updated"}`;

type SeedTriggerRefs = {
  records: ReadonlyMap<SyntheticRecordEventKey, RecordDeliveryEnvelope>;
  thread: { id: string; connectedAccountId: string } | null;
};

type SeedTriggerSample =
  | { kind: "record"; key: SyntheticRecordEventKey }
  | { kind: "messaging"; entityId: string; payload: (thread: { id: string; connectedAccountId: string }) => object };

type SeedTrigger =
  | { kind: "schedule"; cron: string }
  | {
      kind: "event";
      events: RoutineTriggerEvent[];
      recordTypes?: SyntheticRecordType[];
      debounceSeconds: number;
      sample?: SeedTriggerSample;
    };

type SeedRun = {
  status: RoutineRunStatus;
  startedHoursAgo: number;
  durationSeconds: number;
  chargedCredits: number;
  summary?: string;
  error?: string;
};

const runFailureNote = (error: string) =>
  error === "providerUnavailable"
    ? "I could not reach the model provider on this attempt, so I stopped before reading or changing anything. Nothing was modified. The next scheduled run will pick this up."
    : "I stopped before doing any work because this run would have exceeded the credit ceiling set on the routine. Nothing was read or changed.";

export type SeedRoutine = {
  index: number;
  owner: SeedOwner;
  name: string;
  prompt: string;
  enabled: boolean;
  trigger: SeedTrigger;
  runs: SeedRun[];
};

const SYNTHETIC_ROUTINE_LIBRARY: SeedRoutine[] = [
  {
    index: 1,
    owner: "user",
    name: "Weekly pipeline summary",
    prompt: recordRoutinePrompt(1),
    enabled: true,
    trigger: { kind: "schedule", cron: "30 7 * * 1" },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 20,
        durationSeconds: 74,
        chargedCredits: 12,
        summary: "Reported 3 open deals worth 118k weighted, 2 of them overdue.",
      },
    ],
  },
  {
    index: 2,
    owner: "sofiaRossiUser",
    name: "Follow up on stale deals",
    prompt: recordRoutinePrompt(2),
    enabled: true,
    trigger: { kind: "schedule", cron: "0 8 * * *" },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 26,
        durationSeconds: 51,
        chargedCredits: 8,
        summary: "No stale deals needed a new follow-up task.",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 50,
        durationSeconds: 63,
        chargedCredits: 9,
        summary: "Created 2 follow-up tasks and added 2 deal notes.",
      },
    ],
  },
  {
    index: 3,
    owner: "elenaHoffmannUser",
    name: "Check deal line items",
    prompt: recordRoutinePrompt(3),
    enabled: true,
    trigger: {
      kind: "event",
      events: ["record.updated"],
      recordTypes: ["deal"],
      debounceSeconds: 900,
      sample: { kind: "record", key: "deal:0:record.updated" },
    },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 14,
        durationSeconds: 88,
        chargedCredits: 18,
        summary: "Checked 4 service lines; no quantity repair was needed.",
      },
      {
        status: RoutineRunStatus.failed,
        startedHoursAgo: 38,
        durationSeconds: 12,
        chargedCredits: 2,
        error: "providerUnavailable",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 62,
        durationSeconds: 77,
        chargedCredits: 15,
        summary: "Repaired 1 zero quantity and added 1 review note.",
      },
    ],
  },
  {
    index: 4,
    owner: "user",
    name: "Find duplicate CRM records",
    prompt: recordRoutinePrompt(4),
    enabled: true,
    trigger: { kind: "schedule", cron: "15 7 * * 1" },
    runs: [
      {
        status: RoutineRunStatus.blocked,
        startedHoursAgo: 9,
        durationSeconds: 4,
        chargedCredits: 0,
        error: "creditLimitReached",
      },
    ],
  },
  {
    index: 5,
    owner: "sofiaRossiUser",
    name: "Enrich new contacts",
    prompt: recordRoutinePrompt(5),
    enabled: true,
    trigger: {
      kind: "event",
      events: ["record.created"],
      recordTypes: ["contact"],
      debounceSeconds: 600,
    },
    runs: [],
  },
  {
    index: 6,
    owner: "elenaHoffmannUser",
    name: "Complete organization profiles",
    prompt: recordRoutinePrompt(6),
    enabled: true,
    trigger: {
      kind: "event",
      events: ["record.created", "record.updated"],
      recordTypes: ["organization"],
      debounceSeconds: 900,
      sample: { kind: "record", key: "organization:0:record.created" },
    },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 26,
        durationSeconds: 51,
        chargedCredits: 8,
        summary: "The organization profile was already complete.",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 50,
        durationSeconds: 63,
        chargedCredits: 9,
        summary: "Added the website, linked 2 contacts, and opened 1 follow-up task.",
      },
    ],
  },
  {
    index: 7,
    owner: "user",
    name: "Draft replies to new emails",
    prompt: recordRoutinePrompt(7),
    enabled: true,
    trigger: {
      kind: "event",
      events: ["messaging.email.received"],
      debounceSeconds: 300,
      sample: {
        kind: "messaging",
        entityId: fixtureId("35000000", 1),
        payload: (thread) => ({
          connectedAccountId: thread.connectedAccountId,
          provider: "google",
          providerMessageId: "demo-provider-message-1",
          threadId: thread.id,
        }),
      },
    },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 14,
        durationSeconds: 88,
        chargedCredits: 18,
        summary: "Prepared a reply draft and added context to the contact.",
      },
      {
        status: RoutineRunStatus.failed,
        startedHoursAgo: 38,
        durationSeconds: 12,
        chargedCredits: 2,
        error: "providerUnavailable",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 62,
        durationSeconds: 77,
        chargedCredits: 15,
        summary: "Drafted a reply and left the thread open for review.",
      },
    ],
  },
  {
    index: 8,
    owner: "sofiaRossiUser",
    name: "Flag messages from unknown contacts",
    prompt: recordRoutinePrompt(8),
    enabled: true,
    trigger: {
      kind: "event",
      events: ["messaging.message.received"],
      debounceSeconds: 900,
      sample: {
        kind: "messaging",
        entityId: fixtureId("35000000", 2),
        payload: (thread) => ({
          connectedAccountId: thread.connectedAccountId,
          provider: "whatsapp",
          providerMessageId: "demo-provider-message-2",
          threadId: thread.id,
        }),
      },
    },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 9,
        durationSeconds: 4,
        chargedCredits: 11,
        summary: "Completed with no changes needed.",
      },
    ],
  },
  {
    index: 9,
    owner: "elenaHoffmannUser",
    name: "Daily inbox summary and reply drafts",
    prompt: recordRoutinePrompt(9),
    enabled: true,
    trigger: { kind: "schedule", cron: "45 7 * * *" },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 20,
        durationSeconds: 74,
        chargedCredits: 12,
        summary: "Ranked 6 unanswered threads and prepared 3 reply drafts.",
      },
    ],
  },
  {
    index: 10,
    owner: "user",
    name: "Morning pipeline briefing",
    prompt: recordRoutinePrompt(10),
    enabled: true,
    trigger: { kind: "schedule", cron: "45 7 * * *" },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 26,
        durationSeconds: 51,
        chargedCredits: 8,
        summary: "Nothing had drifted since the last run.",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 50,
        durationSeconds: 63,
        chargedCredits: 9,
        summary: "Briefed 3 open deals, 2 blocked tasks and today's two meetings.",
      },
    ],
  },
  {
    index: 11,
    owner: "sofiaRossiUser",
    name: "Weekly sales report",
    prompt: recordRoutinePrompt(11),
    enabled: true,
    trigger: { kind: "schedule", cron: "0 16 * * 5" },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 14,
        durationSeconds: 88,
        chargedCredits: 18,
        summary: "Reported 3 open deals, 2 stalled tasks, and 4 customer meetings.",
      },
      {
        status: RoutineRunStatus.failed,
        startedHoursAgo: 38,
        durationSeconds: 12,
        chargedCredits: 2,
        error: "providerUnavailable",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 62,
        durationSeconds: 77,
        chargedCredits: 15,
        summary: "Summarized pipeline, activity, stalled work, and upcoming meetings.",
      },
    ],
  },
  {
    index: 12,
    owner: "elenaHoffmannUser",
    name: "Log deal stage changes",
    prompt: recordRoutinePrompt(12),
    enabled: true,
    trigger: {
      kind: "event",
      events: ["record.updated"],
      recordTypes: ["deal"],
      debounceSeconds: 600,
    },
    runs: [],
  },
  {
    index: 13,
    owner: "user",
    name: "Research new LinkedIn connections",
    prompt: recordRoutinePrompt(13),
    enabled: false,
    trigger: {
      kind: "event",
      events: ["messaging.relation.created"],
      debounceSeconds: 900,
      sample: {
        kind: "messaging",
        entityId: fixtureId("35000000", 3),
        payload: (thread) => ({
          connectedAccountId: thread.connectedAccountId,
          provider: "linkedin",
          providerUserId: "demo-provider-user-1",
        }),
      },
    },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 20,
        durationSeconds: 74,
        chargedCredits: 12,
        summary: "Enriched 1 new connection and created a follow-up task.",
      },
    ],
  },
  {
    index: 14,
    owner: "sofiaRossiUser",
    name: "Weekly workspace health check",
    prompt: recordRoutinePrompt(14),
    enabled: true,
    trigger: { kind: "schedule", cron: "15 8 * * 1" },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 26,
        durationSeconds: 51,
        chargedCredits: 8,
        summary: "Workspace roles, connections, webhooks, and widgets were healthy.",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 50,
        durationSeconds: 63,
        chargedCredits: 9,
        summary: "Restored 1 dashboard chart and filed the health report.",
      },
    ],
  },
  {
    index: 15,
    owner: "elenaHoffmannUser",
    name: "Find similar prospects on LinkedIn",
    prompt: recordRoutinePrompt(15),
    enabled: true,
    trigger: { kind: "schedule", cron: "0 8 * * 1" },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 14,
        durationSeconds: 88,
        chargedCredits: 18,
        summary: "Added 3 matching organizations to this week's LinkedIn list.",
      },
      {
        status: RoutineRunStatus.failed,
        startedHoursAgo: 38,
        durationSeconds: 12,
        chargedCredits: 2,
        error: "providerUnavailable",
      },
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 62,
        durationSeconds: 77,
        chargedCredits: 15,
        summary: "Found 4 similar accounts and 6 potential buyers.",
      },
    ],
  },
  {
    index: 16,
    owner: "user",
    name: "Check service pricing and deal totals",
    prompt: recordRoutinePrompt(16),
    enabled: true,
    trigger: {
      kind: "event",
      events: ["record.updated"],
      recordTypes: ["service", "deal"],
      debounceSeconds: 900,
      sample: { kind: "record", key: "deal:0:record.updated" },
    },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 9,
        durationSeconds: 4,
        chargedCredits: 11,
        summary: "Completed with no changes needed.",
      },
    ],
  },
  {
    index: 17,
    owner: "sofiaRossiUser",
    name: "Quarterly workspace configuration review",
    prompt: recordRoutinePrompt(17),
    enabled: false,
    trigger: { kind: "schedule", cron: "0 9 1 */3 *" },
    runs: [
      {
        status: RoutineRunStatus.succeeded,
        startedHoursAgo: 20,
        durationSeconds: 74,
        chargedCredits: 12,
        summary: "Reviewed 3 open deals and filed 1 follow-up task.",
      },
    ],
  },
];

export const SYNTHETIC_ROUTINES = SYNTHETIC_ROUTINE_LIBRARY.filter(({ index }) => index !== 10 && index !== 17);

export const SYNTHETIC_ROUTINE_ID_PREFIX = "31000000";
export const SYNTHETIC_ROUTINE_RUN_ID_PREFIX = "32000000";
export const SYNTHETIC_ROUTINE_CONVERSATION_ID_PREFIX = "33000000";

const routineId = (index: number) => fixtureId(SYNTHETIC_ROUTINE_ID_PREFIX, index);
const routineRunId = (routineIndex: number, runIndex: number) =>
  fixtureId(SYNTHETIC_ROUTINE_RUN_ID_PREFIX, routineIndex * 100 + runIndex);
const runConversationId = (routineIndex: number, runIndex: number) =>
  fixtureId(SYNTHETIC_ROUTINE_CONVERSATION_ID_PREFIX, routineIndex * 100 + runIndex);
const runMessageId = (routineIndex: number, runIndex: number, messageIndex: number) =>
  fixtureId("34000000", routineIndex * 10000 + runIndex * 100 + messageIndex);

const OWNER_NAMES: Record<SeedOwner, string> = {
  user: "Max Bergmann",
  sofiaRossiUser: "Sofia Rossi",
  elenaHoffmannUser: "Elena Hoffmann",
};

const SAMPLE_RECORDS: ReadonlyArray<[SyntheticRecordEventKey, string]> = [
  ["deal:0:record.updated", fixtureId("80000000", 1)],
  ["organization:0:record.created", fixtureId("70000000", 1)],
];

async function resolveTriggerRefs(context: SeedContext): Promise<SeedTriggerRefs> {
  const companyId = context.ids.company;
  const records = new Map<SyntheticRecordEventKey, RecordDeliveryEnvelope>();
  for (const [key, recordId] of SAMPLE_RECORDS) {
    const [type, , kind] = key.split(":") as [SyntheticRecordType, string, RecordDeliveryEnvelope["event"]];
    const event = await context.prisma.recordEvent.findFirstOrThrow({
      where: { companyId, typeId: presetId(companyId, type), recordId, kind },
      orderBy: { id: "asc" },
    });
    const payload = RecordEventPayloadSchema.parse(event.payload);
    records.set(key, {
      version: 2,
      id: event.id,
      companyId,
      event: kind,
      timestamp: event.createdAt.toISOString(),
      actorId: event.actorId,
      causeId: event.causeId,
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
          before: before && {
            fieldId: before.fieldId,
            label: before.label,
            valueType: before.valueType,
            format: before.format,
            options: before.options,
            value: before.value,
          },
          after: after && {
            fieldId: after.fieldId,
            label: after.label,
            valueType: after.valueType,
            format: after.format,
            options: after.options,
            value: after.value,
          },
        })),
      },
    });
  }
  const thread = await context.prisma.messagingThread.findFirst({
    where: { companyId },
    orderBy: { createdAt: "asc" },
    select: { id: true, connectedAccountId: true },
  });
  return { records, thread };
}

function triggerSample(
  context: SeedContext,
  refs: SeedTriggerRefs,
  ownerUserId: string,
  sample: SeedTriggerSample | undefined,
): { entityId: string; triggerPayload: object } | null {
  if (!sample) return null;
  if (sample.kind === "record") {
    const envelope = refs.records.get(sample.key);
    if (!envelope) throw new Error(`Missing synthetic routine trigger ${sample.key}`);
    return { entityId: envelope.record.ref.recordId, triggerPayload: envelope };
  }
  if (!refs.thread) return null;
  return {
    entityId: sample.entityId,
    triggerPayload: {
      companyId: context.ids.company,
      userId: ownerUserId,
      entityId: sample.entityId,
      payload: sample.payload(refs.thread),
    },
  };
}

export async function seedRoutines(context: SeedContext): Promise<void> {
  const now = Date.now();
  const refs = await resolveTriggerRefs(context);

  const fixtures = SYNTHETIC_ROUTINES.map((routine) => ({
    id: routineId(routine.index),
    routine,
  }));
  const activeRoutineIds = fixtures.map(({ id }) => id);
  const activeRunIds = SYNTHETIC_ROUTINES.flatMap((routine) =>
    routine.runs.map((_run, runIndex) => routineRunId(routine.index, runIndex)),
  );
  const activeConversationIds = SYNTHETIC_ROUTINES.flatMap((routine) =>
    routine.runs.map((_run, runIndex) => runConversationId(routine.index, runIndex)),
  );

  await context.prisma.routineRun.deleteMany({
    where: {
      companyId: context.ids.company,
      id: {
        startsWith: `${SYNTHETIC_ROUTINE_RUN_ID_PREFIX}-`,
        notIn: activeRunIds,
      },
    },
  });
  await context.prisma.agentConversation.deleteMany({
    where: {
      companyId: context.ids.company,
      origin: AgentConversationOrigin.routine,
      id: {
        startsWith: `${SYNTHETIC_ROUTINE_CONVERSATION_ID_PREFIX}-`,
        notIn: activeConversationIds,
      },
    },
  });
  await context.prisma.routine.deleteMany({
    where: {
      companyId: context.ids.company,
      id: {
        startsWith: `${SYNTHETIC_ROUTINE_ID_PREFIX}-`,
        notIn: activeRoutineIds,
      },
    },
  });

  await upsertFixturesById(fixtures, async ({ id, routine }) => {
    const ownerUserId = context.ids[routine.owner];
    const schedule = routine.trigger.kind === "schedule" ? routine.trigger : undefined;
    const event = routine.trigger.kind === "event" ? routine.trigger : undefined;
    const lastRun = routine.runs.at(0);
    const sample = triggerSample(context, refs, ownerUserId, event?.sample);
    const triggerPayload = sample?.triggerPayload ?? null;

    await seedRecordEventSubscription(context, {
      id,
      kind: "routine",
      ownerUserId,
      events: event?.events ?? [],
      recordTypes: event?.recordTypes ?? [],
      enabled: routine.enabled,
    });
    const data = {
      companyId: context.ids.company,
      ownerUserId,
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
    };

    await context.prisma.routine.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });

    await upsertFixturesById(
      routine.runs.map((run, runIndex) => ({
        id: routineRunId(routine.index, runIndex),
        run,
      })),
      async ({ id: runId, run }) => {
        const startedAt = new Date(now - run.startedHoursAgo * HOUR);
        const finishedAt = new Date(startedAt.getTime() + run.durationSeconds * 1000);
        const runIndex = routine.runs.indexOf(run);
        const conversationId = runConversationId(routine.index, runIndex);

        const conversation = {
          companyId: context.ids.company,
          userId: ownerUserId,
          origin: AgentConversationOrigin.routine,
          title: routine.name,
          archivedAt: null,
          selectedAt: null,
          createdAt: startedAt,
          updatedAt: finishedAt,
        };

        await context.prisma.agentConversation.upsert({
          where: { id: conversationId },
          create: { id: conversationId, ...conversation },
          update: conversation,
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
          {
            role: "assistant" as const,
            text: run.summary ?? runFailureNote(run.error ?? ""),
          },
        ];

        for (const [messageIndex, message] of transcript.entries()) {
          const messageId = runMessageId(routine.index, runIndex, messageIndex);
          const messageRow = {
            conversationId,
            companyId: context.ids.company,
            role: message.role,
            parts: [{ type: "text", text: message.text }] as Prisma.InputJsonValue,
            sequence: BigInt(500_000 + routine.index * 1_000 + runIndex * 10 + messageIndex),
            createdAt: new Date(startedAt.getTime() + messageIndex * 1_000),
          };

          await context.prisma.agentMessage.upsert({
            where: { id: messageId },
            create: { id: messageId, ...messageRow },
            update: messageRow,
          });
        }

        const runData = {
          companyId: context.ids.company,
          routineId: id,
          executedByUserId: ownerUserId,
          executedByName: OWNER_NAMES[routine.owner],
          status: run.status,
          triggerKind: schedule ? RoutineTriggerKind.schedule : RoutineTriggerKind.event,
          triggerEvent: event?.events[0] ?? null,
          conversationId,
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

        await context.prisma.routineRun.upsert({
          where: { id: runId },
          create: { id: runId, ...runData },
          update: runData,
        });
      },
    );
  });
}
