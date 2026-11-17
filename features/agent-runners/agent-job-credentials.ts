export type AgentJobMcpCredentials = { url: string; token: string };

export type AgentJobCredentialRefusal = "ownerInactive" | "ownerApiAccess" | "planRequired";

export type AgentJobCredentialIssue =
  | { ok: true; credentials: AgentJobMcpCredentials }
  | { ok: false; reason: AgentJobCredentialRefusal };

export type AgentJobAttemptRef = { companyId: string; jobId: string; attempt: number };

export abstract class AgentJobCredentials {
  abstract issue(
    args: AgentJobAttemptRef & { ownerUserId: string; runnerId: string; expiresAt: Date },
  ): Promise<AgentJobCredentialIssue>;
  abstract toolCalls(args: AgentJobAttemptRef): Promise<number>;
  abstract revoke(args: AgentJobAttemptRef): Promise<void>;
}
