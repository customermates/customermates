import type { Locale, Status } from "@/generated/prisma";
import type { AgentRunnerClient } from "./agent-runner.schema";

export type StoredAgentRunner = {
  id: string;
  name: string;
  machine: string | null;
  clients: unknown;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  createdById: string;
  createdAt: Date;
};

export type AgentRunnerLookup = StoredAgentRunner & {
  companyId: string;
  company: { deletingAt: Date | null };
  createdBy: { status: Status; pausedByPlanAt: Date | null };
};

export type AgentRunnerWaitingOwner = {
  companyId: string;
  userId: string;
  displayLanguage: Locale | null;
  lastSeenAt: Date | null;
};

export type AgentRunnerHeartbeat = { machine: string | undefined; clients: AgentRunnerClient[]; at: Date };

export type AgentRunnerLiveJob = { id: string; attempts: number };

export abstract class AgentRunnerRepo {
  abstract listRunners(): Promise<StoredAgentRunner[]>;
  abstract createRunner(data: { name: string; tokenHash: string }): Promise<StoredAgentRunner>;
  abstract findRunner(id: string): Promise<Pick<StoredAgentRunner, "id" | "revokedAt" | "createdById"> | null>;
  abstract revokeRunnerUnscoped(args: { companyId: string; id: string; at: Date }): Promise<boolean>;
  abstract findUnrevokedRunnerIdsOfUnscoped(args: { companyId: string; createdById: string }): Promise<string[]>;
  abstract findRunnerByTokenHashUnscoped(tokenHash: string): Promise<AgentRunnerLookup | null>;
  abstract recordHeartbeatUnscoped(id: string, heartbeat: AgentRunnerHeartbeat): Promise<void>;
  abstract touchRunnerUnscoped(id: string, at: Date): Promise<void>;
  abstract findClaimableJobIdsUnscoped(args: {
    companyId: string;
    ownerUserId: string;
    runnerId: string;
    limit: number;
  }): Promise<string[]>;
  abstract findLiveJobsOfRunnerUnscoped(args: { companyId: string; runnerId: string }): Promise<AgentRunnerLiveJob[]>;
  abstract releaseClaimedJobUnscoped(args: {
    companyId: string;
    jobId: string;
    runnerId: string;
    attempt: number;
  }): Promise<boolean>;
  abstract findWaitingOwnersUnscoped(args: { seenSince: Date }): Promise<AgentRunnerWaitingOwner[]>;
}
