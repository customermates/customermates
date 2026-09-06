import type { RepoArgs } from "@/core/utils/types";
import type { GetRoutinesRepo } from "./get-routines.interactor";
import type { GetRoutineRunsRepo } from "./get-routine-runs.interactor";
import type { AdmittedRoutineRun, TriggerRoutinesRepo } from "./trigger-routines.repo";
import type { AnalyzeRoutineRepo, RecordRoutineRiskFindingsRepo } from "./record-routine-risk-findings.interactor";
import type { UpsertRoutineRepo } from "./upsert-routine.interactor";
import type { DeleteRoutineRepo } from "./delete-routine.interactor";
import type { PauseRoutineRepo } from "./pause-routine.interactor";
import type { RunRoutineNowRepo } from "./run-routine-now.interactor";
import type { StartRoutineRunRepo } from "./start-routine-run.interactor";
import type { SweepDueRoutinesRepo } from "./sweep-due-routines.interactor";
import type { ReconcileRoutineRunsRepo } from "./reconcile-routine-runs.interactor";
import type { RoutineRunPage } from "./routine-history";
import type { RoutineDto, RoutineRunDto } from "./routine.schema";
import type { DeleteCustomColumnRoutineRepo } from "@/features/custom-column/delete-custom-column.interactor";

import type { AgentTurnTerminalCode, RoutineRiskKind } from "@/generated/prisma";

import {
  AgentConversationOrigin,
  Prisma,
  RoutineRiskSeverity,
  RoutineRunStatus,
  RoutineTriggerKind,
  Status,
} from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { FilterSchema, type Filter, type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";

import { DEFAULT_ROUTINE_TIMEZONE, nextCronOccurrence, parseCronExpression } from "./routine-schedule";
import {
  DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN,
  DEFAULT_ROUTINE_MAX_RUNS_PER_HOUR,
  RoutineLimitExceededError,
  type RoutineCountLimit,
} from "./routine-run-limits";
import { routineRunStatusFor, summarizeAssistantParts } from "./routine-run-outcome";
import { PrismaRoutineEventAccess, type RoutineEventAccess } from "./routine-event-access";
import {
  carriesChangedFields,
  changedFieldsOf,
  entityTypeForEvents,
  isRecordChangeEvent,
  matchesChangedFields,
} from "./routine-event-filter";
import {
  ROUTINE_DISABLED_REASON_ADMIN_PAUSED,
  ROUTINE_DISABLED_REASON_OWNER_PAUSED,
  ROUTINE_DISABLED_REASON_OWNER_UNAVAILABLE,
} from "./routine-disabled-reason";

const ROUTINE_OWNER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  status: true,
} as const;

const ROUTINE_SELECT = {
  id: true,
  ownerUserId: true,
  owner: { select: ROUTINE_OWNER_SELECT },
  name: true,
  prompt: true,
  modelKey: true,
  enabled: true,
  triggerKind: true,
  cronExpression: true,
  timezone: true,
  runOnceAt: true,
  triggerEvents: true,
  changedFields: true,
  triggerFilters: true,
  debounceSeconds: true,
  maxRunsPerHour: true,
  maxCreditsPerRun: true,
  nextRunAt: true,
  lastRunAt: true,
  lastRunStatus: true,
  disabledReason: true,
  suppressedEventCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ROUTINE_RUN_SELECT = {
  id: true,
  routineId: true,
  executedByUserId: true,
  executedByName: true,
  conversationId: true,
  turnRequestId: true,
  status: true,
  triggerKind: true,
  triggerEvent: true,
  triggerEntityId: true,
  scheduledFor: true,
  startedAt: true,
  finishedAt: true,
  terminalCode: true,
  chargedCredits: true,
  summary: true,
  error: true,
  createdAt: true,
  updatedAt: true,
} as const;

function ownerName(owner: { firstName: string; lastName: string }): string {
  return `${owner.firstName} ${owner.lastName}`.trim();
}

function storedRoutineFilters(value: unknown): Filter[] | null {
  if (value === null) return [];

  const parsed = FilterSchema.array().safeParse(value);
  return parsed.success ? parsed.data : null;
}

function routineDto(row: unknown): RoutineDto {
  const routine = row as RoutineDto;
  if (routine.owner?.status === Status.active) return routine;

  return {
    ...routine,
    enabled: false,
    disabledReason: routine.disabledReason ?? ROUTINE_DISABLED_REASON_OWNER_UNAVAILABLE,
  };
}

export function resolveNextRunAt(
  routine: {
    cronExpression: string | null;
    timezone: string | null;
    runOnceAt: Date | null;
  },
  after: Date,
): Date | null {
  if (routine.cronExpression) {
    const parsed = parseCronExpression(routine.cronExpression);
    if (!parsed.ok) return null;

    return nextCronOccurrence(parsed.cron, after, routine.timezone ?? DEFAULT_ROUTINE_TIMEZONE);
  }

  if (routine.runOnceAt && routine.runOnceAt.getTime() > after.getTime()) return routine.runOnceAt;

  return null;
}

function encodeRoutineRunCursor(createdAt: Date, id: string) {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), "utf8").toString("base64url");
}

function decodeRoutineRunCursor(cursor: string) {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    const createdAt = typeof value.createdAt === "string" ? new Date(value.createdAt) : null;
    if (!createdAt || !Number.isFinite(createdAt.getTime()) || typeof value.id !== "string" || !value.id)
      throw new Error();

    return { createdAt, id: value.id };
  } catch {
    throw new Error("Routine run cursor is invalid.");
  }
}

export class PrismaRoutineRepo
  extends BaseRepository<Prisma.RoutineWhereInput>
  implements
    GetRoutinesRepo,
    GetRoutineRunsRepo,
    UpsertRoutineRepo,
    DeleteRoutineRepo,
    PauseRoutineRepo,
    RunRoutineNowRepo,
    StartRoutineRunRepo,
    SweepDueRoutinesRepo,
    ReconcileRoutineRunsRepo,
    TriggerRoutinesRepo,
    DeleteCustomColumnRoutineRepo,
    AnalyzeRoutineRepo,
    RecordRoutineRiskFindingsRepo
{
  constructor(private readonly routineEventAccess: RoutineEventAccess = new PrismaRoutineEventAccess()) {
    super();
  }

  getSearchableFields() {
    return [{ field: "name" }];
  }

  getSortableFields() {
    return [
      { field: "name", resolvedFields: ["name"] },
      { field: "nextRunAt", resolvedFields: ["nextRunAt"] },
      { field: "lastRunAt", resolvedFields: ["lastRunAt"] },
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "updatedAt", resolvedFields: ["updatedAt"] },
    ];
  }

  getFilterableFields() {
    return Promise.resolve([
      {
        field: FilterFieldKey.createdAt,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt],
      },
      {
        field: FilterFieldKey.updatedAt,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.updatedAt],
      },
    ]);
  }

  async getItems(params: GetQueryParams) {
    const args = await this.buildQueryArgs(params, {
      companyId: this.companyId,
    });

    const routines = await this.prisma.routine.findMany({
      ...args,
      select: ROUTINE_SELECT,
    });

    return routines.map(routineDto);
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, {
      companyId: this.companyId,
    });

    return this.prisma.routine.count({ where });
  }

  async findRoutineById(id: string): Promise<RoutineDto | null> {
    const routine = await this.prisma.routine.findFirst({
      where: { id, companyId: this.companyId },
      select: ROUTINE_SELECT,
    });

    return routine ? routineDto(routine) : null;
  }

  async getRoutineByIdOrThrow(id: string): Promise<RoutineDto> {
    const routine = await this.prisma.routine.findFirstOrThrow({
      where: { id, companyId: this.companyId },
      select: ROUTINE_SELECT,
    });

    return routineDto(routine);
  }

  async isEligibleRoutineOwner(userId: string): Promise<boolean> {
    return (
      (await this.prisma.user.count({
        where: { id: userId, companyId: this.companyId, status: Status.active },
      })) === 1
    );
  }

  async isActiveSystemAdministrator(userId: string): Promise<boolean> {
    return (
      (await this.prisma.user.count({
        where: {
          id: userId,
          companyId: this.companyId,
          status: Status.active,
          role: { companyId: this.companyId, isSystemRole: true },
        },
      })) === 1
    );
  }

  async hasRoutineFilterReference(field: string): Promise<boolean> {
    const routines = await this.prisma.routine.findMany({
      where: {
        companyId: this.companyId,
        triggerFilters: { not: Prisma.DbNull },
      },
      select: { triggerFilters: true },
    });

    return routines.some(
      ({ triggerFilters }) =>
        Array.isArray(triggerFilters) &&
        triggerFilters.some((filter) => (filter as { field?: unknown } | null)?.field === field),
    );
  }

  async countRoutines(): Promise<number> {
    return this.prisma.routine.count({ where: { companyId: this.companyId } });
  }

  async getRoutineRuns(routineId: string, limit: number, cursor?: string | null): Promise<RoutineRunPage> {
    const decoded = cursor ? decodeRoutineRunCursor(cursor) : null;
    const rows = await this.prisma.routineRun.findMany({
      where: {
        routineId,
        companyId: this.companyId,
        ...(decoded
          ? {
              OR: [{ createdAt: { lt: decoded.createdAt } }, { createdAt: decoded.createdAt, id: { lt: decoded.id } }],
            }
          : {}),
      },
      select: ROUTINE_RUN_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const runs = rows.slice(0, limit) as RoutineRunDto[];
    const last = runs.at(-1);

    return {
      runs,
      nextCursor: rows.length > limit && last ? encodeRoutineRunCursor(last.createdAt, last.id) : null,
    };
  }

  @Transaction
  async upsertRoutineOrThrow(
    args: RepoArgs<UpsertRoutineRepo, "upsertRoutineOrThrow">,
    routineLimit: RoutineCountLimit = "unlimited",
  ): Promise<RoutineDto> {
    const { companyId, id: userId } = this.user;
    const { id, ...input } = args;
    const now = new Date();

    const ownerIsEligible =
      (await this.prisma.user.count({
        where: { id: userId, companyId, status: Status.active },
      })) === 1;
    if (!ownerIsEligible) throw new Error("Routine owner is no longer eligible");

    if (id) {
      const existing = await this.prisma.routine.findFirstOrThrow({
        where: { id, companyId, ownerUserId: userId },
        select: ROUTINE_SELECT,
      });

      const triggerKind = input.triggerKind ?? existing.triggerKind;
      const scheduled = triggerKind === RoutineTriggerKind.schedule;
      const switchingToSchedule = existing.triggerKind !== RoutineTriggerKind.schedule && scheduled;
      const cronExpression = scheduled
        ? input.cronExpression === undefined
          ? switchingToSchedule
            ? null
            : existing.cronExpression
          : input.cronExpression
        : null;
      const timezone = scheduled
        ? input.timezone === undefined
          ? switchingToSchedule
            ? DEFAULT_ROUTINE_TIMEZONE
            : existing.timezone
          : input.timezone
        : null;
      const runOnceAt = scheduled
        ? input.runOnceAt === undefined
          ? switchingToSchedule
            ? null
            : existing.runOnceAt
          : input.runOnceAt
        : null;
      if (scheduled && !cronExpression && !runOnceAt)
        throw new Error("Scheduled routines require a cron expression or a one-off date");
      const enabled = input.enabled ?? existing.enabled;
      const triggerEvents = input.triggerEvents ?? existing.triggerEvents;
      if (triggerKind === RoutineTriggerKind.event && triggerEvents.length === 0)
        throw new Error("Event routines require at least one trigger event");
      const existingEntityType = entityTypeForEvents(existing.triggerEvents);
      const triggerEntityType = entityTypeForEvents(triggerEvents);
      const recordTypeChanged = input.triggerEvents !== undefined && triggerEntityType !== existingEntityType;
      const watchesRecordChanges = triggerEntityType !== null && triggerEvents.some(isRecordChangeEvent);

      await this.prisma.routine.update({
        where: {
          id,
          companyId,
          ownerUserId: userId,
          owner: { status: Status.active },
        },
        data: {
          name: input.name,
          prompt: input.prompt,
          modelKey: input.modelKey,
          enabled: input.enabled,
          triggerKind,
          cronExpression,
          timezone,
          runOnceAt,
          triggerEvents: input.triggerEvents,
          changedFields: watchesRecordChanges
            ? recordTypeChanged
              ? (input.changedFields ?? [])
              : input.changedFields
            : [],
          triggerFilters:
            triggerEntityType === null
              ? Prisma.DbNull
              : recordTypeChanged
                ? (input.triggerFilters ?? Prisma.DbNull)
                : input.triggerFilters === undefined
                  ? undefined
                  : (input.triggerFilters ?? Prisma.DbNull),
          debounceSeconds: input.debounceSeconds,
          maxRunsPerHour: input.maxRunsPerHour,
          maxCreditsPerRun: input.maxCreditsPerRun,
          nextRunAt: enabled && scheduled ? resolveNextRunAt({ cronExpression, timezone, runOnceAt }, now) : null,
          disabledReason:
            input.enabled === true
              ? null
              : input.enabled === false
                ? ROUTINE_DISABLED_REASON_OWNER_PAUSED
                : existing.disabledReason,
        },
      });

      if (input.enabled === false) await this.settleQueuedRunsForRoutine(id, ROUTINE_DISABLED_REASON_OWNER_PAUSED, now);

      return this.getRoutineByIdOrThrow(id);
    }

    if (routineLimit !== "unlimited" && (await this.prisma.routine.count({ where: { companyId } })) >= routineLimit)
      throw new RoutineLimitExceededError(routineLimit);

    const triggerKind = input.triggerKind as RoutineTriggerKind;
    const scheduled = triggerKind === RoutineTriggerKind.schedule;
    const cronExpression = scheduled ? (input.cronExpression ?? null) : null;
    const timezone = scheduled ? (input.timezone ?? DEFAULT_ROUTINE_TIMEZONE) : null;
    const runOnceAt = scheduled ? (input.runOnceAt ?? null) : null;
    if (scheduled && !cronExpression && !runOnceAt)
      throw new Error("Scheduled routines require a cron expression or a one-off date");
    const triggerEvents = input.triggerEvents ?? [];
    if (triggerKind === RoutineTriggerKind.event && triggerEvents.length === 0)
      throw new Error("Event routines require at least one trigger event");
    const triggerEntityType = entityTypeForEvents(triggerEvents);
    const created = await this.prisma.routine.create({
      data: {
        companyId,
        ownerUserId: userId,
        name: input.name as string,
        prompt: input.prompt as string,
        modelKey: input.modelKey ?? null,
        enabled: input.enabled ?? true,
        triggerKind,
        cronExpression,
        timezone,
        runOnceAt,
        triggerEvents,
        changedFields: triggerEntityType && triggerEvents.some(isRecordChangeEvent) ? (input.changedFields ?? []) : [],
        triggerFilters: triggerEntityType ? (input.triggerFilters ?? Prisma.DbNull) : Prisma.DbNull,
        debounceSeconds: input.debounceSeconds ?? 300,
        maxRunsPerHour: input.maxRunsPerHour ?? DEFAULT_ROUTINE_MAX_RUNS_PER_HOUR,
        maxCreditsPerRun: input.maxCreditsPerRun ?? DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN,
        nextRunAt:
          (input.enabled ?? true) && scheduled ? resolveNextRunAt({ cronExpression, timezone, runOnceAt }, now) : null,
      },
      select: { id: true },
    });

    return this.getRoutineByIdOrThrow(created.id);
  }

  @Transaction
  async deleteRoutineOrThrow(id: string): Promise<RoutineDto | null> {
    const routine = await this.getRoutineByIdOrThrow(id);
    const runs = await this.prisma.routineRun.findMany({
      where: { routineId: id, companyId: this.companyId },
      select: { id: true, conversationId: true, status: true },
    });
    const conversationsByRun = await this.routineConversationIdsByRun(runs, this.companyId);
    const conversationIds = [...new Set([...conversationsByRun.values()].flatMap((ids) => [...ids]))];
    if (
      runs.some((run) => run.status === RoutineRunStatus.running) ||
      (await this.activeRoutineConversationIds(this.companyId, conversationIds)).size > 0
    )
      return null;

    await this.prisma.routine.delete({
      where: { id, companyId: this.companyId },
    });
    if (conversationIds.length > 0) {
      await this.prisma.agentConversation.deleteMany({
        where: {
          id: { in: conversationIds },
          companyId: this.companyId,
          origin: AgentConversationOrigin.routine,
          routineRuns: { none: {} },
        },
      });
    }

    return routine;
  }

  @Transaction
  async pauseRoutineOrThrow(routineId: string, now: Date): Promise<RoutineDto> {
    await this.getRoutineByIdOrThrow(routineId);
    await this.prisma.routine.update({
      where: { id: routineId, companyId: this.companyId },
      data: {
        enabled: false,
        disabledReason: ROUTINE_DISABLED_REASON_ADMIN_PAUSED,
        nextRunAt: null,
      },
    });
    await this.settleQueuedRunsForRoutine(routineId, ROUTINE_DISABLED_REASON_ADMIN_PAUSED, now);

    return this.getRoutineByIdOrThrow(routineId);
  }

  private async settleQueuedRunsForRoutine(routineId: string, reason: string, now: Date): Promise<void> {
    const settled = await this.prisma.routineRun.updateMany({
      where: {
        routineId,
        companyId: this.companyId,
        status: RoutineRunStatus.queued,
      },
      data: {
        status: RoutineRunStatus.skipped,
        error: reason,
        finishedAt: now,
      },
    });
    if (settled.count === 0) return;

    await this.prisma.routine.updateMany({
      where: {
        id: routineId,
        companyId: this.companyId,
        OR: [{ lastRunAt: null }, { lastRunAt: { lte: now } }],
      },
      data: {
        lastRunStatus: RoutineRunStatus.skipped,
        lastRunAt: now,
      },
    });
  }

  @Transaction
  async createManualRoutineRunOrThrow(
    routineId: string,
    executedByUserId: string,
    now: Date,
  ): Promise<{ id: string; companyId: string; executedByUserId: string }> {
    const routine = await this.prisma.routine.findFirstOrThrow({
      where: {
        id: routineId,
        companyId: this.companyId,
        ownerUserId: executedByUserId,
        owner: { status: Status.active },
        enabled: true,
        triggerKind: RoutineTriggerKind.schedule,
      },
      select: {
        id: true,
        owner: { select: ROUTINE_OWNER_SELECT },
      },
    });
    if (!routine.owner) throw new Error("Routine changed before the manual test run could be created");

    return this.prisma.routineRun.create({
      data: {
        companyId: this.companyId,
        routineId: routine.id,
        executedByUserId,
        executedByName: ownerName(routine.owner),
        status: RoutineRunStatus.queued,
        triggerKind: RoutineTriggerKind.schedule,
        scheduledFor: now,
      },
      select: { id: true, companyId: true, executedByUserId: true },
    });
  }

  @BypassTenantGuard
  async findDueRoutinesUnscoped(now: Date, limit: number) {
    const routines = await this.prisma.routine.findMany({
      where: {
        enabled: true,
        triggerKind: RoutineTriggerKind.schedule,
        ownerUserId: { not: null },
        owner: { status: Status.active },
        nextRunAt: { not: null, lte: now },
      },
      select: {
        id: true,
        companyId: true,
        ownerUserId: true,
        owner: { select: ROUTINE_OWNER_SELECT },
        nextRunAt: true,
        triggerKind: true,
      },
      orderBy: { nextRunAt: "asc" },
      take: limit,
    });

    return routines.flatMap((routine) =>
      routine.ownerUserId && routine.owner
        ? [
            {
              ...routine,
              ownerUserId: routine.ownerUserId,
              owner: routine.owner,
            },
          ]
        : [],
    );
  }

  @BypassTenantGuard
  async claimDueRoutineUnscoped(args: { routineId: string; expectedNextRunAt: Date; now: Date }) {
    const identity = await this.prisma.routine.findUnique({
      where: { id: args.routineId },
      select: { companyId: true },
    });
    if (!identity) return null;

    return this.withCompanyTransaction(identity.companyId, async () => {
      const routine = await this.prisma.routine.findUnique({
        where: { id: args.routineId },
        select: {
          cronExpression: true,
          timezone: true,
          runOnceAt: true,
          triggerKind: true,
          companyId: true,
          enabled: true,
          ownerUserId: true,
          owner: { select: ROUTINE_OWNER_SELECT },
          nextRunAt: true,
        },
      });
      if (
        !routine?.enabled ||
        !routine.ownerUserId ||
        routine.owner?.status !== Status.active ||
        routine.nextRunAt?.getTime() !== args.expectedNextRunAt.getTime()
      )
        return null;

      const nextRunAt = resolveNextRunAt(routine, args.now);
      const claimed = await this.prisma.routine.updateMany({
        where: {
          id: args.routineId,
          enabled: true,
          ownerUserId: routine.ownerUserId,
          owner: { status: Status.active },
          nextRunAt: args.expectedNextRunAt,
        },
        data: { nextRunAt, lastRunAt: args.now },
      });
      if (claimed.count !== 1) return null;

      return this.prisma.routineRun.create({
        data: {
          companyId: routine.companyId,
          routineId: args.routineId,
          executedByUserId: routine.ownerUserId,
          executedByName: ownerName(routine.owner),
          status: RoutineRunStatus.queued,
          triggerKind: routine.triggerKind,
          scheduledFor: args.expectedNextRunAt,
        },
        select: { id: true, companyId: true, executedByUserId: true },
      });
    });
  }

  @BypassTenantGuard
  async findRoutineRunForStartUnscoped(routineRunId: string) {
    const run = await this.prisma.routineRun.findUnique({
      where: { id: routineRunId },
      select: {
        id: true,
        companyId: true,
        status: true,
        triggerEvent: true,
        triggerEntityId: true,
        triggerPayload: true,
        executedByUserId: true,
        routine: { select: ROUTINE_SELECT },
      },
    });
    if (!run) return null;

    return { ...run, routine: routineDto(run.routine) };
  }

  @BypassTenantGuard
  async countRecentRoutineRunsUnscoped(routineId: string, since: Date) {
    return this.prisma.routineRun.count({
      where: {
        routineId,
        createdAt: { gte: since },
        status: { not: RoutineRunStatus.skipped },
      },
    });
  }

  @BypassTenantGuard
  async claimQueuedRoutineRunForOwnerUnscoped(args: {
    routineRunId: string;
    executedByUserId: string;
    maxInFlight: number;
    now: Date;
  }): Promise<{ routine: RoutineDto } | "ownerRunLimit" | "runNotQueued" | "triggerChanged"> {
    const identity = await this.prisma.routineRun.findUnique({
      where: { id: args.routineRunId },
      select: { companyId: true },
    });
    if (!identity) return "runNotQueued";

    return this.withCompanyTransaction(identity.companyId, async () => {
      await this.prisma
        .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`routine-owner:${args.executedByUserId}`}, 0))`;

      const run = await this.prisma.routineRun.findUnique({
        where: { id: args.routineRunId },
        select: {
          routineId: true,
          status: true,
          executedByUserId: true,
          triggerKind: true,
          triggerEvent: true,
          triggerPayload: true,
          routine: { select: ROUTINE_SELECT },
        },
      });
      if (!run || run.status !== RoutineRunStatus.queued || run.executedByUserId !== args.executedByUserId)
        return "runNotQueued";
      if (
        !run.routine.enabled ||
        run.routine.ownerUserId !== args.executedByUserId ||
        run.routine.owner?.status !== Status.active
      ) {
        await this.prisma.routineRun.updateMany({
          where: { id: args.routineRunId, status: RoutineRunStatus.queued },
          data: {
            status: RoutineRunStatus.skipped,
            error: "routineDisabled",
            finishedAt: args.now,
          },
        });
        return "runNotQueued";
      }
      const triggerChanged =
        run.routine.triggerKind !== run.triggerKind ||
        (run.triggerKind === RoutineTriggerKind.event &&
          (!run.triggerEvent ||
            !run.routine.triggerEvents.includes(run.triggerEvent) ||
            (carriesChangedFields(run.triggerPayload) &&
              !matchesChangedFields(run.routine.changedFields, changedFieldsOf(run.triggerPayload)))));
      if (triggerChanged) {
        const skipped = await this.prisma.routineRun.updateMany({
          where: { id: args.routineRunId, status: RoutineRunStatus.queued },
          data: {
            status: RoutineRunStatus.skipped,
            error: "startAbandoned",
            finishedAt: args.now,
          },
        });
        if (skipped.count === 1) {
          await this.prisma.routine.updateMany({
            where: {
              id: run.routineId,
              companyId: identity.companyId,
              OR: [{ lastRunAt: null }, { lastRunAt: { lte: args.now } }],
            },
            data: {
              lastRunStatus: RoutineRunStatus.skipped,
              lastRunAt: args.now,
            },
          });
        }

        return "triggerChanged";
      }

      const inFlight = await this.prisma.routineRun.count({
        where: {
          id: { not: args.routineRunId },
          executedByUserId: args.executedByUserId,
          status: RoutineRunStatus.running,
        },
      });
      if (inFlight >= args.maxInFlight) {
        await this.prisma.routineRun.updateMany({
          where: { id: args.routineRunId, status: RoutineRunStatus.queued },
          data: {
            status: RoutineRunStatus.skipped,
            error: "ownerRunLimit",
            finishedAt: args.now,
          },
        });
        await this.prisma.routine.updateMany({
          where: {
            id: run.routineId,
            companyId: identity.companyId,
            OR: [{ lastRunAt: null }, { lastRunAt: { lte: args.now } }],
          },
          data: {
            lastRunStatus: RoutineRunStatus.skipped,
            lastRunAt: args.now,
          },
        });
        return "ownerRunLimit";
      }

      const claimed = await this.prisma.routineRun.updateMany({
        where: {
          id: args.routineRunId,
          status: RoutineRunStatus.queued,
          executedByUserId: args.executedByUserId,
          routine: {
            enabled: true,
            ownerUserId: args.executedByUserId,
            owner: { status: Status.active },
          },
        },
        data: { status: RoutineRunStatus.running, startedAt: args.now },
      });

      return claimed.count === 1 ? { routine: routineDto(run.routine) } : "runNotQueued";
    });
  }

  @BypassTenantGuard
  async markRoutineRunStartedUnscoped(args: {
    routineRunId: string;
    executedByUserId: string;
    conversationId: string;
    turnRequestId: string;
    now: Date;
  }): Promise<boolean> {
    const identity = await this.prisma.routineRun.findUnique({
      where: { id: args.routineRunId },
      select: { companyId: true },
    });
    if (!identity) return false;

    return this.withCompanyTransaction(identity.companyId, async () => {
      const linked = await this.prisma.routineRun.updateMany({
        where: {
          id: args.routineRunId,
          companyId: identity.companyId,
          executedByUserId: args.executedByUserId,
          status: RoutineRunStatus.running,
          conversationId: args.conversationId,
          turnRequestId: args.turnRequestId,
        },
        data: { startedAt: args.now },
      });

      return linked.count === 1;
    });
  }

  @BypassTenantGuard
  async settleRoutineRunUnscoped(args: {
    routineRunId: string;
    routineId: string;
    expectedStatus: RoutineRunStatus;
    status: RoutineRunStatus;
    error?: string | null;
    summary?: string | null;
    chargedCredits?: number;
    terminalCode?: AgentTurnTerminalCode | null;
    expectedTurnRequestId?: string | null;
    now: Date;
  }): Promise<boolean> {
    const identity = await this.prisma.routineRun.findUnique({
      where: { id: args.routineRunId },
      select: { companyId: true, routineId: true },
    });
    if (!identity || identity.routineId !== args.routineId) return false;

    return this.withCompanyTransaction(identity.companyId, async () => {
      const settled = await this.prisma.routineRun.updateMany({
        where: {
          id: args.routineRunId,
          companyId: identity.companyId,
          routineId: args.routineId,
          status: args.expectedStatus,
          ...(args.expectedTurnRequestId === undefined ? {} : { turnRequestId: args.expectedTurnRequestId }),
        },
        data: {
          status: args.status,
          error: args.error ?? null,
          summary: args.summary ?? null,
          chargedCredits: args.chargedCredits ?? 0,
          terminalCode: args.terminalCode ?? null,
          finishedAt: args.now,
        },
      });
      if (settled.count !== 1) return false;

      await this.prisma.routine.updateMany({
        where: {
          id: args.routineId,
          companyId: identity.companyId,
          OR: [{ lastRunAt: null }, { lastRunAt: { lte: args.now } }],
        },
        data: { lastRunStatus: args.status, lastRunAt: args.now },
      });

      return true;
    });
  }

  @BypassTenantGuard
  async disableRoutineUnscoped(routineId: string, reason: string, executedByUserId: string) {
    await this.prisma.routine.updateMany({
      where: { id: routineId, ownerUserId: executedByUserId },
      data: { enabled: false, disabledReason: reason, nextRunAt: null },
    });
  }

  @BypassTenantGuard
  async findCompaniesWithEventRoutinesUnscoped(limit: number) {
    const routines = await this.prisma.routine.findMany({
      where: { enabled: true, triggerKind: RoutineTriggerKind.event },
      select: { companyId: true },
      take: limit,
    });

    return [...new Set(routines.map((routine) => routine.companyId))];
  }

  @BypassTenantGuard
  async replaceRoutineRiskFindingsUnscoped(args: {
    companyId: string;
    findings: {
      routineId: string;
      peerRoutineId: string | null;
      kind: RoutineRiskKind;
      triggerEvent: string;
      confidence: string;
    }[];
    now: Date;
  }) {
    await this.prisma.routineRiskFinding.deleteMany({
      where: { companyId: args.companyId },
    });
    if (args.findings.length === 0) return;

    await this.prisma.routineRiskFinding.createMany({
      data: args.findings.map((finding) => ({
        companyId: args.companyId,
        routineId: finding.routineId,
        peerRoutineId: finding.peerRoutineId,
        kind: finding.kind,
        triggerEvent: finding.triggerEvent,
        confidence: finding.confidence,
        severity: finding.confidence === "low" ? RoutineRiskSeverity.info : RoutineRiskSeverity.warning,
        detectedAt: args.now,
      })),
      skipDuplicates: true,
    });
  }

  @BypassTenantGuard
  async findEventRoutinesUnscoped(companyId: string, event: string) {
    const routines = await this.prisma.routine.findMany({
      where: {
        companyId,
        enabled: true,
        ownerUserId: { not: null },
        owner: { status: Status.active },
        triggerKind: RoutineTriggerKind.event,
        triggerEvents: { has: event },
      },
      select: {
        id: true,
        ownerUserId: true,
        changedFields: true,
        triggerFilters: true,
        updatedAt: true,
      },
    });

    return routines.flatMap((routine) => {
      const triggerFilters = storedRoutineFilters(routine.triggerFilters);
      if (!routine.ownerUserId || !triggerFilters) return [];

      return [
        {
          ...routine,
          ownerUserId: routine.ownerUserId,
          changedFields: [...routine.changedFields],
          triggerFilters,
        },
      ];
    });
  }

  @BypassTenantGuard
  async countSuppressedRoutineEventsUnscoped(routineIds: string[]) {
    if (routineIds.length === 0) return;

    await this.prisma.routine.updateMany({
      where: { id: { in: routineIds } },
      data: { suppressedEventCount: { increment: 1 } },
    });
  }

  @BypassTenantGuard
  async admitEventRoutineRunsUnscoped(args: {
    companyId: string;
    event: string;
    entityId: string | null;
    triggerPayload: unknown;
    routines: { id: string; ownerUserId: string; updatedAt: Date }[];
    now: Date;
  }): Promise<AdmittedRoutineRun[]> {
    return this.withCompanyTransaction(args.companyId, async () => {
      const expectedRoutines = new Map(args.routines.map((routine) => [routine.id, routine]));
      const routines = await this.prisma.routine.findMany({
        where: {
          id: { in: args.routines.map((routine) => routine.id) },
          companyId: args.companyId,
          enabled: true,
          ownerUserId: { not: null },
          owner: { status: Status.active },
          triggerKind: RoutineTriggerKind.event,
          triggerEvents: { has: args.event },
        },
        select: {
          id: true,
          ownerUserId: true,
          owner: { select: ROUTINE_OWNER_SELECT },
          changedFields: true,
          triggerFilters: true,
          debounceSeconds: true,
          maxRunsPerHour: true,
          updatedAt: true,
        },
      });

      const admitted: AdmittedRoutineRun[] = [];
      for (const routine of routines) {
        if (!routine.ownerUserId || !routine.owner) continue;
        const expected = expectedRoutines.get(routine.id);
        if (
          !expected ||
          expected.ownerUserId !== routine.ownerUserId ||
          expected.updatedAt.getTime() !== routine.updatedAt.getTime()
        )
          continue;
        if (
          carriesChangedFields(args.triggerPayload) &&
          !matchesChangedFields(routine.changedFields, changedFieldsOf(args.triggerPayload))
        )
          continue;
        const triggerFilters = storedRoutineFilters(routine.triggerFilters);
        if (!triggerFilters) continue;
        if (
          !(await this.routineEventAccess.matchesUserUnscoped({
            companyId: args.companyId,
            userId: routine.ownerUserId,
            event: args.event,
            entityId: args.entityId,
            triggerPayload: args.triggerPayload,
            filters: triggerFilters,
          }))
        )
          continue;

        const inFlight = await this.prisma.routineRun.count({
          where: {
            routineId: routine.id,
            status: { in: [RoutineRunStatus.queued, RoutineRunStatus.running] },
          },
        });
        if (inFlight > 0) continue;

        const debounceSince = new Date(args.now.getTime() - routine.debounceSeconds * 1000);
        const recentlyTriggered = await this.prisma.routineRun.count({
          where: { routineId: routine.id, createdAt: { gt: debounceSince } },
        });
        if (recentlyTriggered > 0) continue;

        const hourlyCount = await this.prisma.routineRun.count({
          where: {
            routineId: routine.id,
            createdAt: { gt: new Date(args.now.getTime() - 3_600_000) },
            status: { not: RoutineRunStatus.skipped },
          },
        });
        if (hourlyCount >= routine.maxRunsPerHour) continue;

        const run = await this.prisma.routineRun.create({
          data: {
            companyId: args.companyId,
            routineId: routine.id,
            executedByUserId: routine.ownerUserId,
            executedByName: ownerName(routine.owner),
            status: RoutineRunStatus.queued,
            triggerKind: RoutineTriggerKind.event,
            triggerEvent: args.event,
            triggerEntityId: args.entityId,
            triggerPayload: (args.triggerPayload ?? Prisma.DbNull) as Prisma.InputJsonValue,
            scheduledFor: args.now,
          },
          select: { id: true, executedByUserId: true },
        });

        admitted.push({
          id: run.id,
          routineId: routine.id,
          executedByUserId: run.executedByUserId,
        });
      }

      return admitted;
    });
  }

  @BypassTenantGuard
  async findOwnersWithRunningRunsUnscoped(limit: number) {
    const runs = await this.prisma.routineRun.findMany({
      where: { status: RoutineRunStatus.running },
      select: { executedByUserId: true },
      orderBy: { startedAt: "asc" },
      take: limit,
    });

    return [...new Set(runs.map((run) => run.executedByUserId))];
  }

  @BypassTenantGuard
  async findRunningRoutineRunsUnscoped(limit: number, ownerUserId?: string) {
    return this.prisma.routineRun.findMany({
      where: {
        status: RoutineRunStatus.running,
        turnRequestId: { not: null },
        ...(ownerUserId ? { executedByUserId: ownerUserId } : {}),
      },
      select: {
        id: true,
        routineId: true,
        executedByUserId: true,
        turnRequestId: true,
        conversationId: true,
      },
      orderBy: { startedAt: "asc" },
      take: limit,
    });
  }

  @BypassTenantGuard
  async readRecentRoutineRunOutcomesUnscoped(routineId: string, executedByUserId: string, limit: number) {
    const runs = await this.prisma.routineRun.findMany({
      where: {
        routineId,
        executedByUserId,
        status: {
          in: [RoutineRunStatus.succeeded, RoutineRunStatus.partial, RoutineRunStatus.failed],
        },
      },
      select: { status: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return runs.map((run) => run.status);
  }

  @BypassTenantGuard
  async findExpiredRoutineRunsUnscoped(before: Date, limit: number) {
    return this.prisma.routineRun.findMany({
      where: {
        createdAt: { lt: before },
        status: {
          in: [
            RoutineRunStatus.succeeded,
            RoutineRunStatus.partial,
            RoutineRunStatus.failed,
            RoutineRunStatus.skipped,
            RoutineRunStatus.blocked,
          ],
        },
      },
      select: { id: true, conversationId: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  @BypassTenantGuard
  async deleteRoutineRunsUnscoped(runIds: string[]): Promise<number> {
    const companyIds = await this.prisma.routineRun.findMany({
      where: { id: { in: runIds } },
      select: { companyId: true },
      distinct: ["companyId"],
    });
    let deleted = 0;

    for (const { companyId } of companyIds) {
      deleted += await this.withCompanyTransaction(companyId, async () => {
        const runs = await this.prisma.routineRun.findMany({
          where: {
            id: { in: runIds },
            companyId,
            status: {
              in: [
                RoutineRunStatus.succeeded,
                RoutineRunStatus.partial,
                RoutineRunStatus.failed,
                RoutineRunStatus.skipped,
                RoutineRunStatus.blocked,
              ],
            },
          },
          select: { id: true, conversationId: true },
        });
        const conversationsByRun = await this.routineConversationIdsByRun(runs, companyId);
        const conversationIds = [...new Set([...conversationsByRun.values()].flatMap((ids) => [...ids]))];
        const activeConversationIds = await this.activeRoutineConversationIds(companyId, conversationIds);
        const safeRuns = runs.filter((run) =>
          [...(conversationsByRun.get(run.id) ?? [])].every((id) => !activeConversationIds.has(id)),
        );
        if (safeRuns.length === 0) return 0;

        const safeRunIds = safeRuns.map((run) => run.id);
        const safeConversationIds = [
          ...new Set(safeRunIds.flatMap((runId) => [...(conversationsByRun.get(runId) ?? [])])),
        ];
        const removed = await this.prisma.routineRun.deleteMany({
          where: {
            id: { in: safeRunIds },
            companyId,
            status: {
              in: [
                RoutineRunStatus.succeeded,
                RoutineRunStatus.partial,
                RoutineRunStatus.failed,
                RoutineRunStatus.skipped,
                RoutineRunStatus.blocked,
              ],
            },
          },
        });

        if (safeConversationIds.length > 0) {
          await this.prisma.agentConversation.deleteMany({
            where: {
              id: { in: safeConversationIds },
              companyId,
              origin: AgentConversationOrigin.routine,
              routineRuns: { none: {} },
            },
          });
        }

        return removed.count;
      });
    }

    return deleted;
  }

  @BypassTenantGuard
  async findOrphanedRunningRoutineRunsUnscoped(before: Date, limit: number) {
    const candidates = await this.prisma.routineRun.findMany({
      where: {
        status: RoutineRunStatus.running,
        turnRequestId: null,
        startedAt: { lte: before },
      },
      select: {
        id: true,
        companyId: true,
        routineId: true,
        executedByUserId: true,
      },
      orderBy: { startedAt: "asc" },
      take: limit,
    });

    const orphaned: typeof candidates = [];
    for (const run of candidates) {
      const turn = await this.prisma.agentTurnRequest.findFirst({
        where: {
          companyId: run.companyId,
          userId: run.executedByUserId,
          clientRequestId: run.id,
          conversation: { origin: AgentConversationOrigin.routine },
        },
        select: { id: true, conversationId: true },
        orderBy: { createdAt: "desc" },
      });
      if (!turn) {
        orphaned.push(run);
        continue;
      }

      await this.prisma.routineRun.updateMany({
        where: {
          id: run.id,
          status: RoutineRunStatus.running,
          turnRequestId: null,
        },
        data: { turnRequestId: turn.id, conversationId: turn.conversationId },
      });
    }

    return orphaned;
  }

  private async routineConversationIdsByRun(
    runs: { id: string; conversationId: string | null }[],
    companyId: string,
  ): Promise<Map<string, Set<string>>> {
    const byRun = new Map(runs.map((run) => [run.id, new Set(run.conversationId ? [run.conversationId] : [])]));
    if (runs.length === 0) return byRun;

    const inferred = await this.prisma.agentTurnRequest.findMany({
      where: {
        companyId,
        clientRequestId: { in: runs.map((run) => run.id) },
        conversation: { origin: AgentConversationOrigin.routine },
      },
      select: { clientRequestId: true, conversationId: true },
    });
    for (const turn of inferred) byRun.get(turn.clientRequestId)?.add(turn.conversationId);

    return byRun;
  }

  private async activeRoutineConversationIds(companyId: string, conversationIds: string[]): Promise<Set<string>> {
    if (conversationIds.length === 0) return new Set();

    const active = await this.prisma.agentConversation.findMany({
      where: {
        id: { in: conversationIds },
        companyId,
        origin: AgentConversationOrigin.routine,
        OR: [
          { runLease: { isNot: null } },
          {
            turnRequests: {
              some: {
                status: { in: ["running", "waitingBudget", "needsAttention"] },
              },
            },
          },
          {
            turnRequests: {
              some: { usageEvents: { some: { state: "reserved" } } },
            },
          },
        ],
      },
      select: { id: true },
    });

    return new Set(active.map((conversation) => conversation.id));
  }

  @BypassTenantGuard
  async findStaleQueuedRoutineRunsUnscoped(before: Date, limit: number) {
    return this.prisma.routineRun.findMany({
      where: { status: RoutineRunStatus.queued, createdAt: { lte: before } },
      select: { id: true, companyId: true, executedByUserId: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  @BypassTenantGuard
  async readTurnOutcomeUnscoped(turnRequestId: string) {
    const turn = await this.prisma.agentTurnRequest.findUnique({
      where: { id: turnRequestId },
      select: {
        id: true,
        status: true,
        terminalCode: true,
        conversationId: true,
      },
    });
    if (!turn) return null;

    const usage = await this.prisma.agentUsageEvent.findFirst({
      where: { turnRequestId },
      select: { chargedCredits: true, state: true },
    });

    const assistantMessage = await this.prisma.agentMessage.findFirst({
      where: { turnRequestId, role: "assistant" },
      select: { parts: true },
      orderBy: { sequence: "desc" },
    });

    return {
      status: routineRunStatusFor(turn.status, turn.terminalCode),
      terminalCode: turn.terminalCode,
      settled: turn.status !== "running" && turn.status !== "waitingBudget",
      chargedCredits: usage?.state === "settled" ? usage.chargedCredits : (usage?.chargedCredits ?? 0),
      summary: summarizeAssistantParts(assistantMessage?.parts),
    };
  }
}
