import type { LanguageModel } from "ai";
import type { Validated } from "@/core/validation/validation.utils";
import type { AgentJobFinish, AgentJobRepo, StoredAgentJob } from "@/features/agent-jobs/agent-job.repo";
import type { AgentJobFinishedStatus, AgentJobFinishReason } from "@/features/agent-jobs/agent-job.schema";
import type { AutomationRuleRepo } from "@/features/automation-rules/automation-rule.repo";
import type { ClassifierCharge } from "@/ee/agent-chat/classifier/metered";
import type { AgentOwnKeyPlan } from "@/ee/agent-keys/agent-own-key-plan";
import type { AgentProviderKeyRepo } from "@/ee/agent-keys/agent-provider-key.repo";
import type { AgentJobToolkitFactory } from "./agent-job-toolset";
import type { MateAgentJobCredits } from "./mate-agent-job-credits";
import type { OwnKeyModelFactory } from "./create-own-key-model";
import type { AgentJobLoopInput, AgentJobLoopOutcome, AgentJobStepUsage } from "./run-agent-job-loop";

import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import * as ErrorReporter from "@/core/observability/server";
import { openSecret } from "@/core/security/secret-box";
import { agentProviderKeyBinding } from "@/ee/agent-keys/agent-provider-key-binding";
import { agentStepProvider, chooseAgentProviderModel } from "@/ee/agent-keys/agent-provider-models";
import { getAgentProviderOptions } from "@/ee/agent-chat/agent-provider-options";
import {
  AGENT_JOB_MAX_HOSTED_RUNNING_PER_WORKSPACE,
  AGENT_JOB_MAX_TOOL_CALLS,
  AGENT_JOB_MAX_WALL_MS,
  AGENT_JOB_TRANSCRIPT_MAX_EVENTS,
  AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS,
} from "@/features/agent-jobs/agent-job.schema";
import { clipText } from "@/features/agent-jobs/agent-job-text";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";

import { agentJobFailureCode } from "./agent-job-failure";
import { AgentJobRecorder } from "./agent-job-recorder";
import { buildAgentJobSystemPrompt } from "./agent-job-system-prompt";
import { MateJobBudget } from "./mate-agent-job-budget";
import { buildMateJobSettlement, sumStepTokens } from "./mate-agent-job-settlement";
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

type MateRun = { reservationId: string; budget: MateJobBudget };

type Prepared =
  | {
      ok: true;
      model: LanguageModel;
      providerOptions?: AgentJobLoopInput["providerOptions"];
      mate: MateRun | null;
      keyId: string | null;
      anthropicCache: boolean;
      note: string | null;
    }
  | { ok: false; error: string };

type JobRun = {
  job: StoredAgentJob;
  recorder: AgentJobRecorder;
  mate: MateRun | null;
  keyId: string | null;
  steps: AgentJobStepUsage[];
  auxiliary: ClassifierCharge[];
  cost?: number | null;
  closing?: AgentJobFinish;
};

@TenantInteractor()
export class RunAgentJobInteractor extends AuthenticatedInteractor<RunAgentJobData, RunAgentJobOutcome> {
  constructor(
    private readonly repo: AgentJobRepo,
    private readonly keys: AgentProviderKeyRepo,
    private readonly rules: Pick<AutomationRuleRepo, "findRunUnscoped">,
    private readonly credits: Pick<MateAgentJobCredits, "reserve" | "settle" | "release" | "admitRound" | "extend">,
    private readonly ownKeyPlan: Pick<AgentOwnKeyPlan, "allowed">,
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
      hostedLimit: AGENT_JOB_MAX_HOSTED_RUNNING_PER_WORKSPACE,
      now: started,
      timeoutAt,
    });
    if (!claimed) return { ok: true as const, data: { status: "skipped" } };
    const startedRun = await this.repo.startUnscoped({
      id: jobId,
      companyId,
      attempt: claimed.attempts,
      now: started,
      timeoutAt,
    });
    if (!startedRun) return { ok: true as const, data: { status: "skipped" } };

    return { ok: true as const, data: { status: await this.run(claimed) } };
  }

  private async run(job: StoredAgentJob): Promise<AgentJobFinishedStatus> {
    const recorder = new AgentJobRecorder(this.clock);
    recorder.message("user", job.prompt);
    const run: JobRun = { job, recorder, mate: null, keyId: null, steps: [], auxiliary: [] };
    try {
      const prepared = await this.prepare(job);
      if (!prepared.ok) return await this.fail(run, prepared.error);
      run.mate = prepared.mate;
      run.keyId = prepared.keyId;
      if (prepared.note) recorder.message("assistant", prepared.note);
      const outcome = await this.execute(run, prepared);
      run.steps = outcome.steps;
      run.auxiliary = outcome.auxiliary;
      if (outcome.kind === "stopped") return await this.fail(run, outcome.code);
      if (outcome.kind === "failed") return await this.fail(run, agentJobFailureCode(outcome.error));
      return await this.complete(run, outcome);
    } catch (error) {
      ErrorReporter.captureException(error);
      if (run.closing) return this.close(run, run.closing);
      return this.fail(run, agentJobFailureCode(error));
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
        mate: {
          reservationId: reserved.reservation.reservationId,
          budget: new MateJobBudget(this.credits, reserved.reservation, {
            companyId: job.companyId,
            userId: this.user.id,
          }),
        },
        keyId: null,
        anthropicCache: false,
        note: null,
      };
    }
    return this.prepareOwnKey(job);
  }

  private async prepareOwnKey(job: StoredAgentJob): Promise<Prepared> {
    if (!(await this.ownKeyPlan.allowed(job.companyId))) return { ok: false, error: "planRequired" };
    const stored = await this.keys.findAll();
    const requested = job.model;
    const step = agentStepProvider(
      stored.map((key) => key.provider),
      requested,
    );
    if (!step.ok) return { ok: false, error: step.reason };
    const { provider } = step;
    const sealed = await this.keys.findSealedUnscoped(job.companyId, provider);
    if (!sealed) return { ok: false, error: "noKey" };
    let apiKey: string;
    try {
      apiKey = openSecret(sealed.keyCiphertext, agentProviderKeyBinding(job.companyId, provider));
    } catch {
      return { ok: false, error: "keyUnreadable" };
    }
    const { modelId, retiredDefault } = chooseAgentProviderModel(provider, requested, sealed.defaultModel);
    return {
      ok: true,
      model: this.createModel(provider, apiKey, modelId),
      mate: null,
      keyId: sealed.id,
      anthropicCache: provider === "anthropic",
      note: retiredDefault ? await this.modelFallbackNote(retiredDefault, modelId) : null,
    };
  }

  private async modelFallbackNote(saved: string, used: string): Promise<string> {
    const t = await getTranslator(resolveUserLocale(this.user));
    return t("AgentJobs.transcript.modelFallback", { saved, used });
  }

  private async execute(run: JobRun, prepared: Extract<Prepared, { ok: true }>): Promise<AgentJobLoopOutcome> {
    const { job, recorder } = run;
    const ruleName = await this.ruleName(job);
    const locale = resolveUserLocale(this.user);
    const kit = this.toolkit({
      locale,
      maxToolCalls: AGENT_JOB_MAX_TOOL_CALLS,
      recorder,
      ruleChain: job.ruleChain,
      untrusted: job.promptUntrusted,
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
      ...(budget ? { limits: budget.limits, admitRound: budget.admitRound } : {}),
      ...(prepared.anthropicCache ? { anthropicCache: true } : {}),
      onStep: async () => ({ held: await this.flush(job, recorder) }),
    });
  }

  private async ruleName(job: StoredAgentJob): Promise<string | null> {
    if (job.sourceKind !== "automation" || !job.sourceId) return null;
    const found = await this.rules.findRunUnscoped(job.companyId, job.sourceId);
    return found?.rule?.name ?? null;
  }

  private async complete(
    run: JobRun,
    outcome: Extract<AgentJobLoopOutcome, { kind: "finished" }>,
  ): Promise<AgentJobFinishedStatus> {
    const { job, recorder } = run;
    const status = FINISH_STATUS[outcome.reason];
    recorder.finish(outcome.reason, outcome.text);
    await this.flush(job, recorder);
    const cost = await this.settle(run);
    const tokens = sumStepTokens(run.steps);
    return this.close(run, {
      id: job.id,
      companyId: job.companyId,
      attempt: job.attempts,
      status,
      result: {
        text: clipText(outcome.text, AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS),
        reason: outcome.reason,
        toolCalls: recorder.toolCalls,
      },
      error: status === "succeeded" ? null : outcome.reason,
      inputTokens: tokens.inputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens,
      outputTokens: tokens.outputTokens,
      costMicrocents: cost,
      now: this.clock(),
    });
  }

  private async fail(run: JobRun, code: string): Promise<AgentJobFinishedStatus> {
    const { job, recorder, steps } = run;
    recorder.finish("error");
    await this.flush(job, recorder);
    const cost = await this.settle(run);
    const tokens = sumStepTokens(steps);
    return this.close(run, {
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
  }

  private async close(run: JobRun, finish: AgentJobFinish): Promise<AgentJobFinishedStatus> {
    run.closing = finish;
    await this.repo.finishUnscoped(finish);
    if (run.keyId) {
      const { keyId } = run;
      run.keyId = null;
      await this.keys.touchLastUsedUnscoped(run.job.companyId, keyId, this.clock());
    }
    return finish.status;
  }

  private async settle(run: JobRun): Promise<number | null> {
    if (run.cost === undefined) run.cost = await this.settleCredits(run);
    return run.cost;
  }

  private async settleCredits({ job, mate, steps, auxiliary }: JobRun): Promise<number | null> {
    if (!mate) return null;
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
      const settlement = buildMateJobSettlement(steps, mate.budget.settlementBudget, auxiliary);
      const settled = await this.credits.settle({
        reservationId: mate.reservationId,
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

  private flush(job: StoredAgentJob, recorder: AgentJobRecorder): Promise<boolean> {
    return this.repo.appendEventsUnscoped({
      id: job.id,
      companyId: job.companyId,
      attempt: job.attempts,
      events: recorder.drain(),
      maxEvents: AGENT_JOB_TRANSCRIPT_MAX_EVENTS,
    });
  }
}
