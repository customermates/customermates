import type { RepoArgs } from "@/core/utils/types";
import type { GetRoutinesRepo } from "./get-routines.interactor";
import type { GetRoutineRepo } from "./get-routine.interactor";
import type { GetRoutineRunsRepo } from "./get-routine-runs.interactor";
import type { GetRoutineRunTranscriptRepo } from "./get-routine-run-transcript.interactor";
import type { AdmittedRoutineRun, TriggerRoutinesRepo } from "./trigger-routines.repo";
import type { AnalyzeRoutineRepo, RecordRoutineRiskFindingsRepo } from "./record-routine-risk-findings.interactor";
import type { GetRoutineRisksRepo } from "./get-routine-risks.interactor";
import type { UpsertRoutineRepo } from "./upsert-routine.interactor";
import type { DeleteRoutineRepo } from "./delete-routine.interactor";
import type { RunRoutineNowRepo } from "./run-routine-now.interactor";
import type { StartRoutineRunRepo } from "./start-routine-run.interactor";
import type { SweepDueRoutinesRepo } from "./sweep-due-routines.interactor";
import type { ReconcileRoutineRunsRepo } from "./reconcile-routine-runs.interactor";
import type { RoutineDto, RoutineRunDto } from "./routine.schema";

import type { AgentTurnTerminalCode, Prisma, RoutineRiskKind } from "@/generated/prisma";

import { RoutineRiskSeverity, RoutineRunStatus, RoutineTriggerKind } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";

import { clientSafeAgentMessageParts } from "@/ee/agent-chat/agent-chat.schema";

import { DEFAULT_ROUTINE_TIMEZONE, nextCronOccurrence, parseCronExpression } from "./routine-schedule";
import { routineRunStatusFor, summarizeAssistantParts } from "./routine-run-outcome";

const ROUTINE_SELECT = {
  id: true,
  ownerUserId: true,
  name: true,
  prompt: true,
  modelKey: true,
  enabled: true,
  triggerKind: true,
  cronExpression: true,
  timezone: true,
  runOnceAt: true,
  triggerEvents: true,
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

export function resolveNextRunAt(
  routine: { cronExpression: string | null; timezone: string | null; runOnceAt: Date | null },
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

export class PrismaRoutineRepo
  extends BaseRepository<Prisma.RoutineWhereInput>
  implements
    GetRoutinesRepo,
    GetRoutineRepo,
    GetRoutineRunsRepo,
    GetRoutineRunTranscriptRepo,
    UpsertRoutineRepo,
    DeleteRoutineRepo,
    RunRoutineNowRepo,
    StartRoutineRunRepo,
    SweepDueRoutinesRepo,
    ReconcileRoutineRunsRepo,
    TriggerRoutinesRepo,
    AnalyzeRoutineRepo,
    RecordRoutineRiskFindingsRepo,
    GetRoutineRisksRepo
{
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
      { field: FilterFieldKey.createdAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt] },
      { field: FilterFieldKey.updatedAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.updatedAt] },
    ]);
  }

  async getItems(params: GetQueryParams) {
    const args = await this.buildQueryArgs(params, { companyId: this.companyId });

    const routines = await this.prisma.routine.findMany({ ...args, select: ROUTINE_SELECT });

    return routines as RoutineDto[];
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, { companyId: this.companyId });

    return this.prisma.routine.count({ where });
  }

  async getRoutineByIdOrThrow(id: string): Promise<RoutineDto> {
    const routine = await this.prisma.routine.findFirstOrThrow({
      where: { id, companyId: this.companyId },
      select: ROUTINE_SELECT,
    });

    return routine as RoutineDto;
  }

  async getRoutineRuns(routineId: string, limit: number): Promise<RoutineRunDto[]> {
    const runs = await this.prisma.routineRun.findMany({
      where: { routineId, companyId: this.companyId },
      select: ROUTINE_RUN_SELECT,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return runs as RoutineRunDto[];
  }

  async getRoutineRunTranscript(routineRunId: string) {
    const run = await this.prisma.routineRun.findFirst({
      where: { id: routineRunId, companyId: this.companyId },
      select: { id: true, conversationId: true },
    });
    if (!run?.conversationId) return [];

    const messages = await this.prisma.agentMessage.findMany({
      where: {
        conversationId: run.conversationId,
        companyId: this.companyId,
        conversation: { userId: this.userId, companyId: this.companyId },
      },
      select: { id: true, role: true, parts: true, createdAt: true },
      orderBy: { sequence: "asc" },
    });

    return messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts: clientSafeAgentMessageParts(message.parts, { sanitizeText: true }),
      createdAt: message.createdAt,
    }));
  }

  @Transaction
  async upsertRoutineOrThrow(args: RepoArgs<UpsertRoutineRepo, "upsertRoutineOrThrow">): Promise<RoutineDto> {
    const { companyId, id: userId } = this.user;
    const { id, ...input } = args;
    const now = new Date();

    if (id) {
      const existing = await this.prisma.routine.findFirstOrThrow({
        where: { id, companyId },
        select: ROUTINE_SELECT,
      });

      const merged = {
        cronExpression: input.cronExpression === undefined ? existing.cronExpression : input.cronExpression,
        timezone: input.timezone === undefined ? existing.timezone : input.timezone,
        runOnceAt: input.runOnceAt === undefined ? existing.runOnceAt : input.runOnceAt,
      };
      const enabled = input.enabled ?? existing.enabled;

      await this.prisma.routine.update({
        where: { id, companyId },
        data: {
          ...input,
          nextRunAt: enabled ? resolveNextRunAt(merged, now) : null,
          disabledReason: enabled ? null : existing.disabledReason,
        },
      });

      return this.getRoutineByIdOrThrow(id);
    }

    const created = await this.prisma.routine.create({
      data: {
        companyId,
        ownerUserId: userId,
        name: input.name as string,
        prompt: input.prompt as string,
        modelKey: input.modelKey ?? null,
        enabled: input.enabled ?? true,
        triggerKind: input.triggerKind as RoutineTriggerKind,
        cronExpression: input.cronExpression ?? null,
        timezone: input.timezone ?? DEFAULT_ROUTINE_TIMEZONE,
        runOnceAt: input.runOnceAt ?? null,
        triggerEvents: input.triggerEvents ?? [],
        debounceSeconds: input.debounceSeconds ?? 300,
        maxRunsPerHour: input.maxRunsPerHour ?? 4,
        maxCreditsPerRun: input.maxCreditsPerRun ?? 10,
        nextRunAt:
          (input.enabled ?? true)
            ? resolveNextRunAt(
                {
                  cronExpression: input.cronExpression ?? null,
                  timezone: input.timezone ?? DEFAULT_ROUTINE_TIMEZONE,
                  runOnceAt: input.runOnceAt ?? null,
                },
                now,
              )
            : null,
      },
      select: { id: true },
    });

    return this.getRoutineByIdOrThrow(created.id);
  }

  @Transaction
  async deleteRoutineOrThrow(id: string): Promise<RoutineDto> {
    const routine = await this.getRoutineByIdOrThrow(id);
    await this.prisma.routine.delete({ where: { id, companyId: this.companyId } });

    return routine;
  }

  async createManualRoutineRunOrThrow(routineId: string, now: Date): Promise<{ id: string }> {
    const routine = await this.getRoutineByIdOrThrow(routineId);

    return this.prisma.routineRun.create({
      data: {
        companyId: this.companyId,
        routineId: routine.id,
        status: RoutineRunStatus.queued,
        triggerKind: routine.triggerKind,
        scheduledFor: now,
      },
      select: { id: true },
    });
  }

  @BypassTenantGuard
  async findDueRoutinesUnscoped(now: Date, limit: number) {
    return this.prisma.routine.findMany({
      where: { enabled: true, nextRunAt: { not: null, lte: now } },
      select: { id: true, companyId: true, ownerUserId: true, nextRunAt: true, triggerKind: true },
      orderBy: { nextRunAt: "asc" },
      take: limit,
    });
  }

  @BypassTenantGuard
  async claimDueRoutineUnscoped(args: { routineId: string; expectedNextRunAt: Date; now: Date }) {
    const routine = await this.prisma.routine.findUnique({
      where: { id: args.routineId },
      select: { cronExpression: true, timezone: true, runOnceAt: true, triggerKind: true, companyId: true },
    });
    if (!routine) return null;

    const nextRunAt = resolveNextRunAt(routine, args.now);

    const claimed = await this.prisma.routine.updateMany({
      where: { id: args.routineId, enabled: true, nextRunAt: args.expectedNextRunAt },
      data: { nextRunAt, lastRunAt: args.now },
    });
    if (claimed.count !== 1) return null;

    return this.prisma.routineRun.create({
      data: {
        companyId: routine.companyId,
        routineId: args.routineId,
        status: RoutineRunStatus.queued,
        triggerKind: routine.triggerKind,
        scheduledFor: args.expectedNextRunAt,
      },
      select: { id: true, companyId: true },
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
        routine: { select: ROUTINE_SELECT },
      },
    });
    if (!run) return null;

    return { ...run, routine: run.routine as RoutineDto };
  }

  @BypassTenantGuard
  async countInFlightRoutineRunsForOwnerUnscoped(ownerUserId: string, excludeRunId: string) {
    return this.prisma.routineRun.count({
      where: {
        id: { not: excludeRunId },
        status: RoutineRunStatus.running,
        routine: { ownerUserId },
      },
    });
  }

  @BypassTenantGuard
  async countRecentRoutineRunsUnscoped(routineId: string, since: Date) {
    return this.prisma.routineRun.count({
      where: { routineId, createdAt: { gte: since }, status: { not: RoutineRunStatus.skipped } },
    });
  }

  @BypassTenantGuard
  async claimQueuedRoutineRunUnscoped(routineRunId: string, now: Date) {
    const claimed = await this.prisma.routineRun.updateMany({
      where: { id: routineRunId, status: RoutineRunStatus.queued },
      data: { status: RoutineRunStatus.running, startedAt: now },
    });

    return claimed.count === 1;
  }

  @BypassTenantGuard
  async markRoutineRunStartedUnscoped(args: {
    routineRunId: string;
    conversationId: string;
    turnRequestId: string;
    now: Date;
  }) {
    await this.prisma.routineRun.updateMany({
      where: { id: args.routineRunId },
      data: { conversationId: args.conversationId, turnRequestId: args.turnRequestId, startedAt: args.now },
    });
  }

  @BypassTenantGuard
  async settleRoutineRunUnscoped(args: {
    routineRunId: string;
    routineId: string;
    status: RoutineRunStatus;
    error?: string | null;
    summary?: string | null;
    chargedCredits?: number;
    terminalCode?: AgentTurnTerminalCode | null;
    now: Date;
  }) {
    await this.prisma.routineRun.updateMany({
      where: { id: args.routineRunId },
      data: {
        status: args.status,
        error: args.error ?? null,
        summary: args.summary ?? null,
        chargedCredits: args.chargedCredits ?? 0,
        terminalCode: args.terminalCode ?? null,
        finishedAt: args.now,
      },
    });

    await this.prisma.routine.updateMany({
      where: { id: args.routineId },
      data: { lastRunStatus: args.status, lastRunAt: args.now },
    });
  }

  @BypassTenantGuard
  async disableRoutineUnscoped(routineId: string, reason: string) {
    await this.prisma.routine.updateMany({
      where: { id: routineId },
      data: { enabled: false, disabledReason: reason, nextRunAt: null },
    });
  }

  async getRoutineRisks(routineId: string) {
    return this.prisma.routineRiskFinding.findMany({
      where: { routineId, companyId: this.companyId, resolvedAt: null },
      select: { id: true, kind: true, severity: true, triggerEvent: true, peerRoutineId: true, confidence: true },
      orderBy: { detectedAt: "desc" },
    });
  }

  @BypassTenantGuard
  async findRoutinesForAnalysisUnscoped(companyId: string) {
    const routines = await this.prisma.routine.findMany({
      where: { companyId, enabled: true, triggerKind: RoutineTriggerKind.event },
      select: { id: true, name: true, prompt: true, triggerEvents: true },
    });

    return routines.map((routine) => ({ ...routine, triggerEvents: [...routine.triggerEvents] }));
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
    await this.prisma.routineRiskFinding.deleteMany({ where: { companyId: args.companyId } });
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
    return this.prisma.routine.findMany({
      where: { companyId, enabled: true, triggerKind: RoutineTriggerKind.event, triggerEvents: { has: event } },
      select: { id: true, ownerUserId: true },
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
    routineIds: string[];
    now: Date;
  }): Promise<AdmittedRoutineRun[]> {
    const routines = await this.prisma.routine.findMany({
      where: { id: { in: args.routineIds }, companyId: args.companyId },
      select: { id: true, ownerUserId: true, debounceSeconds: true, maxRunsPerHour: true },
    });

    const admitted: AdmittedRoutineRun[] = [];
    for (const routine of routines) {
      const inFlight = await this.prisma.routineRun.count({
        where: { routineId: routine.id, status: { in: [RoutineRunStatus.queued, RoutineRunStatus.running] } },
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
          status: RoutineRunStatus.queued,
          triggerKind: RoutineTriggerKind.event,
          triggerEvent: args.event,
          triggerEntityId: args.entityId,
          scheduledFor: args.now,
        },
        select: { id: true },
      });

      admitted.push({ id: run.id, routineId: routine.id, ownerUserId: routine.ownerUserId });
    }

    return admitted;
  }

  @BypassTenantGuard
  async findOwnersWithRunningRunsUnscoped(limit: number) {
    const runs = await this.prisma.routineRun.findMany({
      where: { status: RoutineRunStatus.running },
      select: { routine: { select: { ownerUserId: true } } },
      orderBy: { startedAt: "asc" },
      take: limit,
    });

    return [...new Set(runs.map((run) => run.routine.ownerUserId))];
  }

  @BypassTenantGuard
  async findRunningRoutineRunsUnscoped(limit: number, ownerUserId?: string) {
    return this.prisma.routineRun.findMany({
      where: {
        status: RoutineRunStatus.running,
        turnRequestId: { not: null },
        ...(ownerUserId ? { routine: { ownerUserId } } : {}),
      },
      select: { id: true, routineId: true, turnRequestId: true, conversationId: true },
      orderBy: { startedAt: "asc" },
      take: limit,
    });
  }

  @BypassTenantGuard
  async findStaleQueuedRoutineRunsUnscoped(before: Date, limit: number) {
    return this.prisma.routineRun.findMany({
      where: { status: RoutineRunStatus.queued, createdAt: { lte: before } },
      select: { id: true, companyId: true, routine: { select: { ownerUserId: true } } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  @BypassTenantGuard
  async readTurnOutcomeUnscoped(turnRequestId: string) {
    const turn = await this.prisma.agentTurnRequest.findUnique({
      where: { id: turnRequestId },
      select: { id: true, status: true, terminalCode: true, conversationId: true },
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
