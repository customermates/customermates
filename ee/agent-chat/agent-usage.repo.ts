import type { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import type { AgentUsageSettlement } from "./agent-usage-settlement";
import type {
  AgentRetrievalPayer,
  AgentWorkspaceCreditPool,
  AgentRetrievalGrant,
  AgentRetrievalCharge,
  AgentTurnCreditState,
  WorkspacePlatformReservation,
} from "./agent-usage.service";

export type AgentUsageReservationExtension =
  | { disposition: "extended"; reservedMicrocents: number }
  | { disposition: "credit_limit" }
  | { disposition: "run_credit_limit"; ceilingMicrocents: number }
  | { disposition: "hosted_ai_unavailable" }
  | { disposition: "turn_error" };

export type AgentUsageReservationOutcome = "reserved" | "allowance" | "unavailable";

export type AgentUsageReservationEvent = {
  id: string;
  companyId: string;
  userId: string;
  sessionId: string;
  reservedMicrocents: number;
  planSnapshot: SubscriptionPlan;
  subscriptionStatusSnapshot: SubscriptionStatus;
  allowanceMicrocentsSnapshot: number;
  periodStart: Date;
  periodEnd: Date;
};

export abstract class AgentUsageRepo {
  abstract getUserCreditUsageUnscoped(
    companyId: string,
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ usedMicrocents: number; recentTurnMicrocents: number | null }>;
  abstract getUserCreditAdjustmentUnscoped(
    companyId: string,
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number>;
  abstract findUserForUsageUnscoped(userId: string): Promise<{
    id: string;
    companyId: string;
    status: Status;
    createdAt: Date;
    agentCreditActivatedAt: Date | null;
    subscription: {
      status: SubscriptionStatus;
      plan: SubscriptionPlan;
      trialEndDate: Date | null;
      agentCreditAnchorAt: Date | null;
      enterpriseAgentCreditsPerUser: number | null;
      createdAt: Date;
    } | null;
  } | null>;
  abstract reserveUsageEventUnscoped(
    event: {
      id: string;
      companyId: string;
      userId: string;
      sessionId: string;
      reservedMicrocents: number;
      planSnapshot: SubscriptionPlan;
      subscriptionStatusSnapshot: SubscriptionStatus;
      allowanceMicrocentsSnapshot: number;
      periodStart: Date;
      periodEnd: Date;
    },
    creditState?: AgentTurnCreditState,
  ): Promise<boolean>;
  abstract reserveAgentJobUsageEventUnscoped(event: AgentUsageReservationEvent): Promise<AgentUsageReservationOutcome>;
  abstract releaseUsageReservationUnscoped(args: {
    id: string;
    companyId: string;
    userId: string;
    releasedAt: Date;
  }): Promise<void>;
  abstract settleUsageReservationUnscoped(args: {
    id: string;
    companyId: string;
    userId: string;
    settlement: AgentUsageSettlement;
    settledAt: Date;
  }): Promise<boolean>;
  abstract extendAgentJobUsageReservationUnscoped(args: {
    id: string;
    companyId: string;
    userId: string;
    requiredMicrocents: number;
    ceilingMicrocents: number;
  }): Promise<AgentUsageReservationExtension>;
  abstract admitAgentJobProviderRoundUnscoped(args: {
    id: string;
    companyId: string;
    userId: string;
    now: Date;
  }): Promise<boolean>;
  abstract findAbandonedAgentJobUsageUnscoped(args: {
    reservedBefore: Date;
    limit: number;
  }): Promise<Array<{ id: string; companyId: string; userId: string }>>;
  abstract closeInterruptedAgentJobUsageUnscoped(args: {
    id: string;
    companyId: string;
    userId: string;
    model: string;
    now: Date;
  }): Promise<"retained" | "released" | "none">;
  abstract admitsHostedAiRetrievalUnscoped(now: Date): Promise<boolean>;
  abstract getWorkspaceCreditPoolUnscoped(companyId: string, now: Date): Promise<AgentWorkspaceCreditPool | null>;
  abstract accruePlatformUsageUnscoped(args: {
    purpose: string;
    charge: AgentRetrievalCharge;
    now: Date;
  }): Promise<void>;
  abstract reservePlatformUsageUnscoped(args: {
    purpose: string;
    model: string;
    reservedMicrocents: number;
    now: Date;
  }): Promise<string | null>;
  abstract settlePlatformUsageUnscoped(args: {
    reservationId: string;
    charge: AgentRetrievalCharge | null;
    now: Date;
  }): Promise<void>;
  abstract settleStalePlatformReservationsUnscoped(args: { reservedBefore: Date; now: Date }): Promise<number>;
  abstract reserveWorkspacePlatformUsageUnscoped(args: {
    companyId: string;
    purpose: string;
    model: string;
    reservedMicrocents: number;
    capMicrocents: number;
    now: Date;
  }): Promise<WorkspacePlatformReservation>;
  abstract getWorkspacePlatformSpendUnscoped(args: {
    companyId: string;
    purpose: string;
  }): Promise<{ usedMicrocents: number; heldMicrocents: number }>;
  abstract reserveRetrievalUsageUnscoped(args: {
    grant: AgentRetrievalGrant;
    reservedMicrocents: number;
    model: string;
    now: Date;
  }): Promise<string | null>;
  abstract settleRetrievalUsageUnscoped(args: {
    grant: AgentRetrievalGrant;
    reservationId: string;
    reservedMicrocents: number;
    reservedAt: Date;
    charge: AgentRetrievalCharge | null;
    payer: AgentRetrievalPayer;
    now: Date;
  }): Promise<void>;
  abstract releaseStaleRetrievalReservationsUnscoped(args: {
    companyId?: string;
    reservedBefore: Date;
    now: Date;
  }): Promise<number>;
}
