import type {
  AgentRunnerHeartbeat,
  AgentRunnerLookup,
  AgentRunnerOfflineWorkspace,
  StoredAgentRunner,
} from "../agent-runner.repo";

import { AgentRunnerRepo } from "../agent-runner.repo";
import { generateAgentRunnerToken, hashAgentRunnerToken } from "../agent-runner-token";

import { COMPANY_ID, RUNNER_ID } from "./agent-runner-fixtures";

type StoredWithHash = AgentRunnerLookup & { tokenHash: string };

export class FakeAgentRunnerRepo extends AgentRunnerRepo {
  runners = new Map<string, StoredWithHash>();
  heartbeats: Array<{ id: string } & AgentRunnerHeartbeat> = [];
  touched: Array<{ id: string; at: Date }> = [];
  offline: AgentRunnerOfflineWorkspace[] = [];
  offlineQueries: Date[] = [];

  addRunner(overrides: Partial<AgentRunnerLookup> = {}): { token: string; runner: AgentRunnerLookup } {
    const token = generateAgentRunnerToken();
    const runner: AgentRunnerLookup = {
      id: RUNNER_ID,
      name: "Office laptop",
      machine: null,
      clients: [],
      lastSeenAt: null,
      revokedAt: null,
      createdAt: new Date("2026-11-16T10:00:00.000Z"),
      companyId: COMPANY_ID,
      company: { deletingAt: null },
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
      createdAt: new Date("2026-11-16T10:00:00.000Z"),
      companyId: COMPANY_ID,
      company: { deletingAt: null },
      tokenHash: data.tokenHash,
    };
    this.runners.set(runner.id, runner);
    return Promise.resolve(runner);
  }

  revokeRunner(id: string, at: Date): Promise<Date | null> {
    const runner = this.runners.get(id);
    if (!runner || runner.companyId !== COMPANY_ID) return Promise.resolve(null);
    runner.revokedAt ??= at;
    return Promise.resolve(runner.revokedAt);
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

  findOfflineWorkspacesUnscoped(args: { seenSince: Date }): Promise<AgentRunnerOfflineWorkspace[]> {
    this.offlineQueries.push(args.seenSince);
    return Promise.resolve(this.offline);
  }
}
