import type { Locale } from "@/generated/prisma";
import type { AgentRunnerClient } from "./agent-runner.schema";

export type StoredAgentRunner = {
  id: string;
  name: string;
  machine: string | null;
  clients: unknown;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export type AgentRunnerLookup = StoredAgentRunner & {
  companyId: string;
  company: { deletingAt: Date | null };
};

export type AgentRunnerOwner = { userId: string; displayLanguage: Locale | null };

export type AgentRunnerOfflineWorkspace = { companyId: string; owners: AgentRunnerOwner[] };

export type AgentRunnerHeartbeat = { machine: string | undefined; clients: AgentRunnerClient[]; at: Date };

export abstract class AgentRunnerRepo {
  abstract listRunners(): Promise<StoredAgentRunner[]>;
  abstract createRunner(data: { name: string; tokenHash: string }): Promise<StoredAgentRunner>;
  abstract revokeRunner(id: string, at: Date): Promise<Date | null>;
  abstract findRunnerByTokenHashUnscoped(tokenHash: string): Promise<AgentRunnerLookup | null>;
  abstract recordHeartbeatUnscoped(id: string, heartbeat: AgentRunnerHeartbeat): Promise<void>;
  abstract touchRunnerUnscoped(id: string, at: Date): Promise<void>;
  abstract findOfflineWorkspacesUnscoped(args: { seenSince: Date }): Promise<AgentRunnerOfflineWorkspace[]>;
}
