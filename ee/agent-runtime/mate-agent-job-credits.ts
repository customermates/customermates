import type { AgentJobCredits, AgentJobCreditsRelease } from "@/features/agent-jobs/agent-job-credits";
import type { AgentUsageReservationExtension } from "@/ee/agent-chat/agent-usage.repo";
import type { AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { AgentUsageSettlement } from "@/ee/agent-chat/agent-usage-settlement";
import type { AgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";
import type { AgentModelEntry } from "@/ee/agent-chat/model-catalog";

import * as ErrorReporter from "@/core/observability/server";
import { agentCreditsToMicrocents } from "@/ee/agent-chat/agent-credit-policy";
import { agentJobUsageSessionId } from "@/ee/agent-chat/agent-job-usage-session";
import { resolveAgentModel } from "@/ee/agent-chat/model-catalog";
import { DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN } from "@/ee/routines/routine-run-limits";

export const MATE_JOB_MAX_CREDITS_PER_RUN = DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN;
const RESERVE_ATTEMPTS = 2;

export type MateJobReservation = {
  reservationId: string;
  budget: AgentTurnBudget;
  reservedMicrocents: number;
  ceilingMicrocents: number;
};

export type MateJobReservationOutcome =
  | { ok: true; reservation: MateJobReservation }
  | { ok: false; reason: "credits" | "unavailable" };

type ReservationOwner = { reservationId: string; companyId: string; userId: string };

export function mateJobReservationId(jobId: string, attempt: number): string {
  return agentJobUsageSessionId(jobId, attempt);
}

export class MateAgentJobCredits implements AgentJobCredits {
  readonly model: AgentModelEntry;

  constructor(
    private readonly usage: Pick<
      AgentUsageService,
      | "prepareTurn"
      | "reserveUsage"
      | "settleReservation"
      | "releaseReservation"
      | "extendAgentJobReservation"
      | "admitAgentJobProviderRound"
      | "closeInterruptedAgentJobReservation"
      | "findAbandonedAgentJobReservations"
    >,
    model?: AgentModelEntry,
  ) {
    this.model = model ?? resolveAgentModel(null, "routine");
  }

  async reserve(args: {
    jobId: string;
    attempt: number;
    companyId: string;
    userId: string;
    now?: Date;
  }): Promise<MateJobReservationOutcome> {
    const now = args.now ?? new Date();
    const ceilingMicrocents = agentCreditsToMicrocents(MATE_JOB_MAX_CREDITS_PER_RUN);
    const reservationId = mateJobReservationId(args.jobId, args.attempt);
    let refusal: unknown = null;
    try {
      for (let attempt = 0; attempt < RESERVE_ATTEMPTS; attempt += 1) {
        const admission = await this.usage.prepareTurn(args.userId, now, {
          model: this.model,
          creditCeilingMicrocents: ceilingMicrocents,
        });
        if (!admission.reservation) {
          return {
            ok: false,
            reason: admission.summary.blockedReason === "credits_exhausted" ? "credits" : "unavailable",
          };
        }
        try {
          const reserved = await this.usage.reserveUsage({
            reservationId,
            companyId: args.companyId,
            userId: args.userId,
            reservation: admission.reservation,
          });
          if (!reserved) return { ok: false, reason: "unavailable" };
          return {
            ok: true,
            reservation: {
              reservationId,
              budget: admission.reservation.budget,
              reservedMicrocents: admission.reservation.reservedMicrocents,
              ceilingMicrocents,
            },
          };
        } catch (error) {
          refusal = error;
        }
      }
    } catch (error) {
      refusal = error;
    }
    ErrorReporter.captureException(refusal);
    return { ok: false, reason: "unavailable" };
  }

  async admitRound(args: ReservationOwner & { now?: Date }): Promise<boolean> {
    return this.usage.admitAgentJobProviderRound(args);
  }

  async extend(
    args: ReservationOwner & { requiredMicrocents: number; ceilingMicrocents: number },
  ): Promise<AgentUsageReservationExtension> {
    return this.usage.extendAgentJobReservation(args);
  }

  async settle(args: ReservationOwner & { settlement: AgentUsageSettlement }): Promise<boolean> {
    return this.usage.settleReservation(args);
  }

  async release(args: AgentJobCreditsRelease): Promise<void> {
    await this.usage.releaseReservation({
      reservationId: mateJobReservationId(args.jobId, args.attempt),
      companyId: args.companyId,
      userId: args.userId,
    });
  }

  async closeAbandoned(args: { reservedBefore: Date; now: Date; limit: number }): Promise<number> {
    const abandoned = await this.usage.findAbandonedAgentJobReservations({
      reservedBefore: args.reservedBefore,
      limit: args.limit,
    });
    let closed = 0;
    for (const reservation of abandoned) {
      try {
        const outcome = await this.usage.closeInterruptedAgentJobReservation({
          ...reservation,
          model: this.model.modelId,
          now: args.now,
        });
        if (outcome !== "none") closed += 1;
      } catch (error) {
        ErrorReporter.captureException(error);
      }
    }
    return closed;
  }

  async settleInterrupted(args: AgentJobCreditsRelease): Promise<"retained" | "released" | "none"> {
    return this.usage.closeInterruptedAgentJobReservation({
      reservationId: mateJobReservationId(args.jobId, args.attempt),
      companyId: args.companyId,
      userId: args.userId,
      model: this.model.modelId,
    });
  }
}
