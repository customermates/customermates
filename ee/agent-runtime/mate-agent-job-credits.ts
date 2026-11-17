import type { AgentJobCredits, AgentJobCreditsRelease } from "@/features/agent-jobs/agent-job-credits";
import type { AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { AgentUsageSettlement } from "@/ee/agent-chat/agent-usage-settlement";
import type { AgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";
import type { AgentModelEntry } from "@/ee/agent-chat/model-catalog";

import { agentCreditsToMicrocents } from "@/ee/agent-chat/agent-credit-policy";
import { resolveAgentModel } from "@/ee/agent-chat/model-catalog";
import { DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN } from "@/ee/routines/routine-run-limits";

export type MateJobReservation = {
  reservationId: string;
  budget: AgentTurnBudget;
  reservedMicrocents: number;
};

export type MateJobReservationOutcome =
  | { ok: true; reservation: MateJobReservation }
  | { ok: false; reason: "credits" | "unavailable" };

export function mateJobReservationId(jobId: string, attempt: number): string {
  return `agent-job:${jobId}:${attempt}`;
}

export class MateAgentJobCredits implements AgentJobCredits {
  readonly model: AgentModelEntry;

  constructor(
    private readonly usage: Pick<
      AgentUsageService,
      "prepareTurn" | "reserveUsage" | "settleReservation" | "releaseReservation"
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
    const admission = await this.usage.prepareTurn(args.userId, now, {
      model: this.model,
      creditCeilingMicrocents: agentCreditsToMicrocents(DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN),
    });
    if (!admission.reservation) {
      return {
        ok: false,
        reason: admission.summary.blockedReason === "credits_exhausted" ? "credits" : "unavailable",
      };
    }
    const reservationId = mateJobReservationId(args.jobId, args.attempt);
    try {
      const reserved = await this.usage.reserveUsage({
        reservationId,
        companyId: args.companyId,
        userId: args.userId,
        reservation: admission.reservation,
      });
      if (!reserved) return { ok: false, reason: "unavailable" };
    } catch {
      return { ok: false, reason: "credits" };
    }
    return {
      ok: true,
      reservation: {
        reservationId,
        budget: admission.reservation.budget,
        reservedMicrocents: admission.reservation.reservedMicrocents,
      },
    };
  }

  async settle(args: {
    reservationId: string;
    companyId: string;
    userId: string;
    settlement: AgentUsageSettlement;
  }): Promise<boolean> {
    return this.usage.settleReservation(args);
  }

  async release(args: AgentJobCreditsRelease): Promise<void> {
    await this.usage.releaseReservation({
      reservationId: mateJobReservationId(args.jobId, args.attempt),
      companyId: args.companyId,
      userId: args.userId,
    });
  }
}
