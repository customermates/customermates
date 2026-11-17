import type { StoredUsers } from "@/core/decorators/background-tenant";
import type { AuthService } from "@/features/auth/auth.service";
import type { AgentJobMcpCredentials } from "./agent-job-credentials";

import { mcpWorkspaceUrl } from "@/features/auth/mcp-resource";

import { AgentJobCredentials } from "./agent-job-credentials";

export function agentJobKeyName(jobId: string): string {
  return `Runner job ${jobId}`;
}

export class AuthAgentJobCredentials extends AgentJobCredentials {
  constructor(
    private readonly auth: Pick<AuthService, "createExpiringApiKey" | "revokeApiKeysNamed">,
    private readonly users: StoredUsers,
    private readonly baseUrl: string,
  ) {
    super();
  }

  async issue(args: {
    companyId: string;
    ownerUserId: string;
    jobId: string;
    expiresAt: Date;
  }): Promise<AgentJobMcpCredentials | null> {
    const owner = await this.users.getActiveUserByIdOrThrow(args.ownerUserId).catch(() => null);
    if (!owner || owner.companyId !== args.companyId) return null;
    const key = await this.auth.createExpiringApiKey({
      ownerEmail: owner.email,
      companyId: args.companyId,
      name: agentJobKeyName(args.jobId),
      expiresAt: args.expiresAt,
    });
    return key ? { token: key.key, url: mcpWorkspaceUrl(this.baseUrl, args.companyId) } : null;
  }

  async revoke(args: { companyId: string; jobId: string }): Promise<void> {
    await this.auth.revokeApiKeysNamed(args.companyId, agentJobKeyName(args.jobId));
  }
}
