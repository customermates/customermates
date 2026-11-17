import type { LanguageModel } from "ai";
import type { Validated } from "@/core/validation/validation.utils";
import type { AgentJobRepo, StoredAgentJob } from "@/features/agent-jobs/agent-job.repo";
import type { AgentJobFinishedStatus, AgentJobFinishReason } from "@/features/agent-jobs/agent-job.schema";
import type { AutomationRuleRepo } from "@/features/automation-rules/automation-rule.repo";
import type { AgentProviderKeyRepo } from "@/ee/agent-keys/agent-provider-key.repo";
import type { AgentJobToolkitFactory } from "./agent-job-toolset";
import type { MateAgentJobCredits, MateJobReservation } from "./mate-agent-job-credits";
import type { OwnKeyModelFactory } from "./create-own-key-model";
import type { AgentJobLoopInput, AgentJobLoopOutcome, AgentJobStepUsage } from "./run-agent-job-loop";

import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import * as ErrorReporter from "@/core/observability/server";
import { openSecret } from "@/core/security/secret-box";
import { agentProviderOfModel, resolveAgentProviderModel } from "@/ee/agent-keys/agent-provider-models";
import { getAgentProviderOptions } from "@/ee/agent-chat/agent-provider-options";
import {
  AGENT_JOB_MAX_TOOL_CALLS,
  AGENT_JOB_MAX_WALL_MS,
  AGENT_JOB_TRANSCRIPT_MAX_EVENTS,
  AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS,
} from "@/features/agent-jobs/agent-job.schema";
import { resolveUserLocale } from "@/i18n/user-locale";

import { agentJobFailureCode } from "./agent-job-failure";
import { AgentJobRecorder } from "./agent-job-recorder";
import { buildAgentJobSystemPrompt } from "./agent-job-system-prompt";
import { buildMateJobSettlement, mateJobOutOfBudget, sumStepTokens } from "./mate-agent-job-settlement";
import { runAgentJobLoop } from "./run-agent-job-loop";

const RunAgentJobSchema = z.object({ jobId: z.uuid() }).strict();
type RunAgentJobData = z.infer<typeof RunAgentJobSchema>;

export type RunAgentJobOutcome = { status: AgentJobFinishedStatus | "skipped" };

const CLAIM_GRACE_MS = 60_000;
const FINISH_STATUS: Record<AgentJobFinishReason, AgentJobFinishedStatus> = {
  stop: "succeeded",
  toolLimit: "failed",
  creditLimit: "failed",
  error: "failed",
  timeLimit: "timedOut",
  cancelled: "cancelled",
};

type Prepared =
  | {
      ok: true;
      model: LanguageModel;
      providerOptions?: AgentJobLoopInput["providerOptions"];
      mate: MateJobReservation | null;
      keyId: string | null;
    }
  | { ok: false; error: string };

@TenantInteractor()
export class RunAgentJobInteractor extends AuthenticatedInteractor<RunAgentJobData, RunAgentJobOutcome> {
  constructor(
    private readonly repo: AgentJobRepo,
    private readonly keys: AgentProviderKeyRepo,
    private readonly rules: Pick<AutomationRuleRepo, "findRunUnscoped">,
    private readonly credits: Pick<MateAgentJobCredits, "reserve" | "settle" | "release">,
    private readonly createModel: OwnKeyModelFactory,
    private readonly toolkit: AgentJobToolkitFactory,
    private readonly loop: typeof runAgentJobLoop = runAgentJobLoop,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  @Validate(RunAgentJobSchema)
  async invoke({ jobId }: RunAgentJobData): Validated<RunAgentJobOutcome> {
    const { companyId } = this.user;
    const job = await this.repo.findUnscoped(companyId, jobId);
    if (!job || job.ownerUserId !== this.user.id || job.runtime === "runner")
      return { ok: true as const, data: { status: "skipped" } };

    const started = this.clock();
    const timeoutAt = new Date(started.getTime() + AGENT_JOB_MAX_WALL_MS + CLAIM_GRACE_MS);
    const claimed = await this.repo.claimUnscoped({
      companyId,
      runtime: job.runtime,
      jobId,
      now: started,
      timeoutAt,
    });
    if (!claimed) return { ok: true as const, data: { status: "skipped" } };
    await this.repo.startUnscoped({ id: jobId, companyId, attempt: claimed.attempts, now: started, timeoutAt });

    return { ok: true as const, data: { status: await this.run(claimed) } };
  }

  private async run(job: StoredAgentJob): Promise<AgentJobFinishedStatus> {
    const recorder = new AgentJobRecorder(this.clock);
    recorder.message("user", job.prompt);
    let reservation: MateJobReservation | null = null;
    let steps: AgentJobStepUsage[] = [];
    try {
      const prepared = await this.prepare(job);
      if (!prepared.ok) return await this.fail(job, recorder, prepared.error, steps, null);
      reservation = prepared.mate;
      const outcome = await this.execute(job, recorder, prepared);
      steps = outcome.steps;
      if (outcome.kind === "failed")
        return await this.fail(job, recorder, agentJobFailureCode(outcome.error), steps, reservation, prepared.keyId);
      return await this.complete(job, recorder, outcome, reservation, prepared.keyId);
    } catch (error) {
      ErrorReporter.captureException(error);
      return this.fail(job, recorder, agentJobFailureCode(error), steps, reservation);
    }
  }

  private async prepare(job: StoredAgentJob): Promise<Prepared> {
    if (job.runtime === "mate") {
      const reserved = await this.credits.reserve({
        jobId: job.id,
        attempt: job.attempts,
        companyId: job.companyId,
        userId: this.user.id,
        now: this.clock(),
      });
      if (!reserved.ok)
        return { ok: false, error: reserved.reason === "credits" ? "creditsExhausted" : "hostedAiUnavailable" };
      const { budget } = reserved.reservation;
      return {
        ok: true,
        model: budget.modelSpec,
        providerOptions: getAgentProviderOptions(
          budget.servingProvider,
          budget.inferenceRegion,
        ) as AgentJobLoopInput["providerOptions"],
        mate: reserved.reservation,
        keyId: null,
      };
    }
    return this.prepareOwnKey(job);
  }

  private async prepareOwnKey(job: StoredAgentJob): Promise<Prepared> {
    const stored = await this.keys.findAll();
    const requested = job.model;
    const provider = requested ? agentProviderOfModel(requested) : (stored[0]?.provider ?? null);
    if (!provider) return { ok: false, error: requested ? "modelUnavailable" : "noKey" };
    const row = stored.find((key) => key.provider === provider);
    if (!row) return { ok: false, error: "noKey" };
    const sealed = await this.keys.findSealedUnscoped(job.companyId, provider);
    if (!sealed) return { ok: false, error: "noKey" };
    let apiKey: string;
    try {
      apiKey = openSecret(sealed.keyCiphertext);
    } catch {
      return { ok: false, error: "keyUnreadable" };
    }
    const modelId = resolveAgentProviderModel(provider, requested, row.defaultModel);
    return { ok: true, model: this.createModel(provider, apiKey, modelId), mate: null, keyId: sealed.id };
  }

  private async execute(
    job: StoredAgentJob,
    recorder: AgentJobRecorder,
    prepared: Extract<Prepared, { ok: true }>,
  ): Promise<AgentJobLoopOutcome> {
    const ruleName = await this.ruleName(job);
    const locale = resolveUserLocale(this.user);
    const kit = this.toolkit({
      locale,
      maxToolCalls: AGENT_JOB_MAX_TOOL_CALLS,
      recorder,
      ruleChain: job.ruleChain,
    });
    const budget = prepared.mate?.budget;
    return this.loop({
      model: prepared.model,
      ...(prepared.providerOptions ? { providerOptions: prepared.providerOptions } : {}),
      system: buildAgentJobSystemPrompt({
        userName: `${this.user.firstName} ${this.user.lastName}`.trim(),
        locale,
        workspaceName: this.user.company?.slug ?? null,
        ruleName,
        promptUntrusted: job.promptUntrusted,
        maxToolCalls: AGENT_JOB_MAX_TOOL_CALLS,
        maxMinutes: AGENT_JOB_MAX_WALL_MS / 60_000,
      }),
      prompt: job.prompt,
      tools: kit.tools,
      activeToolNames: kit.activeToolNames,
      recorder,
      maxToolCalls: AGENT_JOB_MAX_TOOL_CALLS,
      wallMs: AGENT_JOB_MAX_WALL_MS,
      ...(budget ? { outOfBudget: (steps: readonly AgentJobStepUsage[]) => mateJobOutOfBudget(steps, budget) } : {}),
      onStep: () => this.flush(job, recorder),
    });
  }

  private async ruleName(job: StoredAgentJob): Promise<string | null> {
    if (job.sourceKind !== "automation" || !job.sourceId) return null;
    const found = await this.rules.findRunUnscoped(job.companyId, job.sourceId);
    return found?.rule?.name ?? null;
  }

  private async complete(
    job: StoredAgentJob,
    recorder: AgentJobRecorder,
    outcome: Extract<AgentJobLoopOutcome, { kind: "finished" }>,
    reservation: MateJobReservation | null,
    keyId: string | null,
  ): Promise<AgentJobFinishedStatus> {
    const status = FINISH_STATUS[outcome.reason];
    recorder.finish(outcome.reason, outcome.text);
    await this.flush(job, recorder);
    const cost = await this.settle(job, outcome.steps, reservation);
    const tokens = sumStepTokens(outcome.steps);
    await this.repo.finishUnscoped({
      id: job.id,
      companyId: job.companyId,
      attempt: job.attempts,
      status,
      result: {
        text: outcome.text.slice(0, AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS),
        reason: outcome.reason,
        toolCalls: recorder.toolCalls,
      },
      error: status === "succeeded" ? null : outcome.reason,
      inputTokens: tokens.inputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens,
      outputTokens: tokens.outputTokens,
      costMicrocents: cost,
      now: this.clock(),
    });
    if (keyId) await this.keys.touchLastUsedUnscoped(job.companyId, keyId, this.clock());
    return status;
  }

  private async fail(
    job: StoredAgentJob,
    recorder: AgentJobRecorder,
    code: string,
    steps: AgentJobStepUsage[],
    reservation: MateJobReservation | null,
    keyId: string | null = null,
  ): Promise<AgentJobFinishedStatus> {
    recorder.finish("error");
    await this.flush(job, recorder);
    const cost = await this.settle(job, steps, reservation);
    const tokens = sumStepTokens(steps);
    await this.repo.finishUnscoped({
      id: job.id,
      companyId: job.companyId,
      attempt: job.attempts,
      status: "failed",
      result: null,
      error: code,
      inputTokens: steps.length ? tokens.inputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens : null,
      outputTokens: steps.length ? tokens.outputTokens : null,
      costMicrocents: cost,
      now: this.clock(),
    });
    if (keyId) await this.keys.touchLastUsedUnscoped(job.companyId, keyId, this.clock());
    return "failed";
  }

  private async settle(
    job: StoredAgentJob,
    steps: readonly AgentJobStepUsage[],
    reservation: MateJobReservation | null,
  ): Promise<number | null> {
    if (!reservation) return null;
    try {
      if (steps.length === 0) {
        await this.credits.release({
          jobId: job.id,
          attempt: job.attempts,
          companyId: job.companyId,
          userId: this.user.id,
        });
        return 0;
      }
      const settlement = buildMateJobSettlement(steps, reservation.budget);
      const settled = await this.credits.settle({
        reservationId: reservation.reservationId,
        companyId: job.companyId,
        userId: this.user.id,
        settlement,
      });
      return settled ? settlement.chargedMicrocents : null;
    } catch (error) {
      ErrorReporter.captureException(error);
      await this.releaseAfterFailedSettlement(job);
      return null;
    }
  }

  private async releaseAfterFailedSettlement(job: StoredAgentJob): Promise<void> {
    try {
      await this.credits.release({
        jobId: job.id,
        attempt: job.attempts,
        companyId: job.companyId,
        userId: this.user.id,
      });
    } catch (error) {
      ErrorReporter.captureException(error);
    }
  }

  private async flush(job: StoredAgentJob, recorder: AgentJobRecorder): Promise<void> {
    await this.repo.appendEventsUnscoped({
      id: job.id,
      companyId: job.companyId,
      attempt: job.attempts,
      events: recorder.drain(),
      maxEvents: AGENT_JOB_TRANSCRIPT_MAX_EVENTS,
    });
  }
}
