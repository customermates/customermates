import type { AgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";
import type { MateAgentJobCredits, MateJobReservation } from "./mate-agent-job-credits";
import type { AgentJobLoopLimits, AgentJobRound, AgentJobRoundAdmission } from "./run-agent-job-loop";

import { agentRoundReserveMicrocents } from "@/ee/agent-chat/agent-budget-policy";

import { AgentJobStop } from "./agent-job-failure";
import { mateJobSpentMicrocents } from "./mate-agent-job-settlement";

export class MateJobBudget {
  private reservedMicrocents: number;

  constructor(
    private readonly credits: Pick<MateAgentJobCredits, "admitRound" | "extend">,
    private readonly reservation: MateJobReservation,
    private readonly owner: { companyId: string; userId: string },
  ) {
    this.reservedMicrocents = reservation.reservedMicrocents;
  }

  get limits(): AgentJobLoopLimits {
    const { budget } = this.reservation;
    return {
      maxOutputTokens: budget.maxOutputTokens,
      maxContextBytes: budget.maxContextBytes,
      ...(budget.reasoningEffort ? { reasoning: budget.reasoningEffort } : {}),
    };
  }

  get settlementBudget(): AgentTurnBudget {
    return { ...this.reservation.budget, reservedMicrocents: this.reservedMicrocents };
  }

  admitRound = async (round: AgentJobRound): Promise<AgentJobRoundAdmission> => {
    const { budget, reservationId, ceilingMicrocents } = this.reservation;
    const roundReserveMicrocents = agentRoundReserveMicrocents(budget, round.contextBytes, round.measured);
    const requiredMicrocents = mateJobSpentMicrocents(round.steps, round.auxiliary, budget) + roundReserveMicrocents;
    if (requiredMicrocents > ceilingMicrocents) return { admitted: false };

    if (!(await this.credits.admitRound({ reservationId, ...this.owner })))
      throw new AgentJobStop("hostedAiUnavailable");
    if (requiredMicrocents <= this.reservedMicrocents) return { admitted: true, roundReserveMicrocents };

    const extension = await this.credits.extend({
      reservationId,
      ...this.owner,
      requiredMicrocents,
      ceilingMicrocents,
    });
    if (extension.disposition === "extended") {
      this.reservedMicrocents = extension.reservedMicrocents;
      return { admitted: true, roundReserveMicrocents };
    }
    if (extension.disposition === "credit_limit" || extension.disposition === "run_credit_limit")
      return { admitted: false };
    throw new AgentJobStop("hostedAiUnavailable");
  };
}
