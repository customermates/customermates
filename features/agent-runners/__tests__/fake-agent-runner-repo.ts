import type {
  AgentRunnerHeartbeat,
  AgentRunnerLiveJob,
  AgentRunnerLookup,
  AgentRunnerWaitingOwner,
  StoredAgentRunner,
} from "../agent-runner.repo";

import { Status } from "@/generated/prisma";

import { AgentRunnerRepo } from "../agent-runner.repo";
import { generateAgentRunnerToken, hashAgentRunnerToken } from "../agent-runner-token";

import { COMPANY_ID, OWNER_ID, RUNNER_ID } from "./agent-runner-fixtures";

type StoredWithHash = AgentRunnerLookup & { tokenHash: string };

export class FakeAgentRunnerRepo extends AgentRunnerRepo {
  runners = new Map<string, StoredWithHash>();
  heartbeats: Array<{ id: string } & AgentRunnerHeartbeat> = [];
  touched: Array<{ id: string; at: Date }> = [];
  waiting: AgentRunnerWaitingOwner[] = [];
  waitingQueries: Date[] = [];
  claimable: string[] = [];
  claimableQueries: Array<{ companyId: string; ownerUserId: string; runnerId: string; limit: number }> = [];
  liveJobs: AgentRunnerLiveJob[] = [];
  released: Array<{ companyId: string; jobId: string; runnerId: string; attempt: number }> = [];

  addRunner(overrides: Partial<AgentRunnerLookup> = {}): { token: string; runner: AgentRunnerLookup } {
    const token = generateAgentRunnerToken();
    const runner: AgentRunnerLookup = {
      id: RUNNER_ID,
      name: "Office laptop",
      machine: null,
      clients: [],
      lastSeenAt: null,
      revokedAt: null,
      createdById: OWNER_ID,
      createdAt: new Date("2026-11-16T10:00:00.000Z"),
      companyId: COMPANY_ID,
      company: { deletingAt: null },
      createdBy: { status: Status.active },
      ...overrides,
    };
    this.runners.set(runner.id, { ...runner, tokenHash: hashAgentRunnerToken(token) });
    return { token, runner };
  }

  markRevoked(id: string, at: Date): void {
    const runner = this.runners.get(id);
    if (runner) runner.revokedAt = at;
  }

  listRunners(): Promise<StoredAgentRunner[]> {
    return Promise.resolve([...this.runners.values()].filter((runner) => runner.companyId === COMPANY_ID));
  }

  createRunner(data: { name: string; tokenHash: string }): Promise<StoredAgentRunner> {
    const runner: StoredWithHash = {
      id: RUNNER_ID,
      name: data.name,
      machine: null,
      clients: [],
      lastSeenAt: null,
      revokedAt: null,
      createdById: OWNER_ID,
      createdAt: new Date("2026-11-16T10:00:00.000Z"),
      companyId: COMPANY_ID,
      company: { deletingAt: null },
      createdBy: { status: Status.active },
      tokenHash: data.tokenHash,
    };
    this.runners.set(runner.id, runner);
    return Promise.resolve(runner);
  }

  findRunner(id: string): Promise<Pick<StoredAgentRunner, "id" | "revokedAt"> | null> {
    const runner = this.runners.get(id);
    if (!runner || runner.companyId !== COMPANY_ID) return Promise.resolve(null);
    return Promise.resolve({ id: runner.id, revokedAt: runner.revokedAt });
  }

  revokeRunnerUnscoped(args: { companyId: string; id: string; at: Date }): Promise<boolean> {
    const runner = this.runners.get(args.id);
    if (!runner || runner.companyId !== args.companyId || runner.revokedAt) return Promise.resolve(false);
    runner.revokedAt = args.at;
    return Promise.resolve(true);
  }

  findUnrevokedRunnerIdsOfUnscoped(args: { companyId: string; createdById: string }): Promise<string[]> {
    return Promise.resolve(
      [...this.runners.values()]
        .filter(
          (runner) =>
            runner.companyId === args.companyId && runner.createdById === args.createdById && !runner.revokedAt,
        )
        .map((runner) => runner.id),
    );
  }

  findRunnerByTokenHashUnscoped(tokenHash: string): Promise<AgentRunnerLookup | null> {
    return Promise.resolve([...this.runners.values()].find((runner) => runner.tokenHash === tokenHash) ?? null);
  }

  recordHeartbeatUnscoped(id: string, heartbeat: AgentRunnerHeartbeat): Promise<void> {
    this.heartbeats.push({ id, ...heartbeat });
    return Promise.resolve();
  }

  touchRunnerUnscoped(id: string, at: Date): Promise<void> {
    this.touched.push({ id, at });
    return Promise.resolve();
  }

  findClaimableJobIdsUnscoped(args: {
    companyId: string;
    ownerUserId: string;
    runnerId: string;
    limit: number;
  }): Promise<string[]> {
    this.claimableQueries.push(args);
    return Promise.resolve(this.claimable.slice(0, args.limit));
  }

  findLiveJobsOfRunnerUnscoped(): Promise<AgentRunnerLiveJob[]> {
    return Promise.resolve(this.liveJobs);
  }

  releaseClaimedJobUnscoped(args: {
    companyId: string;
    jobId: string;
    runnerId: string;
    attempt: number;
  }): Promise<boolean> {
    this.released.push(args);
    return Promise.resolve(true);
  }

  findWaitingOwnersUnscoped(args: { seenSince: Date }): Promise<AgentRunnerWaitingOwner[]> {
    this.waitingQueries.push(args.seenSince);
    return Promise.resolve(this.waiting);
  }
}
