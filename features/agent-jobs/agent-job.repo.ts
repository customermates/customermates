import type { AgentJobStatus, AgentRuntime, Prisma } from "@/generated/prisma";
import type { AgentJobFinishedStatus } from "./agent-job.schema";
import type { AgentJobCursor } from "./agent-job-cursor";

export type StoredAgentJob = {
  id: string;
  companyId: string;
  runtime: AgentRuntime;
  status: AgentJobStatus;
  sourceKind: string;
  sourceId: string | null;
  ownerUserId: string;
  prompt: string;
  promptUntrusted: boolean;
  model: string | null;
  runnerId: string | null;
  attempts: number;
  claimedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  timeoutAt: Date | null;
  result: Prisma.JsonValue | null;
  transcript: Prisma.JsonValue | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costMicrocents: bigint | null;
  error: string | null;
  createdAt: Date;
};

export type StoredAgentJobSummary = Omit<StoredAgentJob, "prompt" | "promptUntrusted" | "transcript">;

export type AgentJobEnqueue = {
  runtime: AgentRuntime;
  sourceKind: string;
  sourceId: string | null;
  ownerUserId: string;
  prompt: string;
  promptUntrusted: boolean;
  model: string | null;
  runnerId: string | null;
};

export type AgentJobFilter = {
  ownerUserId?: string;
  status?: AgentJobStatus[];
  sourceKind?: string;
  sourceId?: string;
  cursor: AgentJobCursor | null;
  limit: number;
};

export type AgentJobClaim = {
  companyId: string;
  runtime: AgentRuntime;
  jobId?: string;
  runnerId?: string;
  now: Date;
  timeoutAt: Date;
};

export type AgentJobFinish = {
  id: string;
  companyId: string;
  status: AgentJobFinishedStatus;
  result: Prisma.InputJsonValue | null;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costMicrocents: number | null;
  now: Date;
};

export type AgentJobSweepOutcome = {
  id: string;
  companyId: string;
  ownerUserId: string;
  runtime: AgentRuntime;
  attempts: number;
  requeued: boolean;
};

export abstract class AgentJobRepo {
  abstract enqueue(data: AgentJobEnqueue): Promise<StoredAgentJob>;
  abstract findPage(filter: AgentJobFilter): Promise<StoredAgentJobSummary[]>;
  abstract findOne(id: string): Promise<StoredAgentJob | null>;
  abstract findUnscoped(companyId: string, id: string): Promise<StoredAgentJob | null>;
  abstract claimUnscoped(claim: AgentJobClaim): Promise<StoredAgentJob | null>;
  abstract startUnscoped(args: { id: string; companyId: string; now: Date; timeoutAt: Date }): Promise<boolean>;
  abstract appendEventsUnscoped(args: {
    id: string;
    companyId: string;
    events: Prisma.InputJsonValue[];
    maxEvents: number;
  }): Promise<void>;
  abstract finishUnscoped(args: AgentJobFinish): Promise<boolean>;
  abstract discardQueuedUnscoped(args: { id: string; companyId: string; error: string; now: Date }): Promise<boolean>;
  abstract sweepTimeoutsUnscoped(args: {
    now: Date;
    maxAttempts: number;
    limit: number;
  }): Promise<AgentJobSweepOutcome[]>;
  abstract deleteFinishedBeforeUnscoped(before: Date, limit: number): Promise<number>;
}
