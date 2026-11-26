import type { StoredUsers } from "@/core/decorators/background-tenant";
import type { WorkspacePlanService } from "@/ee/subscription/workspace-plan.service";
import type { AuthService } from "@/features/auth/auth.service";
import type { AgentJobAttemptRef, AgentJobCredentialIssue } from "./agent-job-credentials";

import { canUseApiKeys } from "@/core/auth/api-key-route-guard";
import { MCP_ENDPOINT_PATH } from "@/features/auth/mcp-resource";

import { AgentJobCredentials } from "./agent-job-credentials";
import { agentJobCredentialMetadata, agentJobKeyName } from "./agent-job-credential-marker";

export class AuthAgentJobCredentials extends AgentJobCredentials {
  constructor(
    private readonly auth: Pick<AuthService, "createExpiringApiKey" | "revokeApiKeysNamed" | "apiKeyRequestsNamed">,
    private readonly users: StoredUsers,
    private readonly plans: Pick<WorkspacePlanService, "canUseIntegrations">,
    private readonly baseUrl: string,
  ) {
    super();
  }

  async issue(
    args: AgentJobAttemptRef & { ownerUserId: string; runnerId: string; expiresAt: Date },
  ): Promise<AgentJobCredentialIssue> {
    const owner = await this.users.getActiveUserByIdOrThrow(args.ownerUserId).catch(() => null);
    if (!owner || owner.companyId !== args.companyId) return { ok: false, reason: "ownerInactive" };
    if (!canUseApiKeys(owner.role)) return { ok: false, reason: "ownerApiAccess" };
    if (!(await this.plans.canUseIntegrations(args.companyId))) return { ok: false, reason: "planRequired" };

    for (let earlier = 1; earlier < args.attempt; earlier += 1)
      await this.auth.revokeApiKeysNamed(args.companyId, agentJobKeyName(args.jobId, earlier));
    const name = agentJobKeyName(args.jobId, args.attempt);
    await this.auth.revokeApiKeysNamed(args.companyId, name);
    const key = await this.auth.createExpiringApiKey({
      ownerEmail: owner.email,
      companyId: args.companyId,
      name,
      expiresAt: args.expiresAt,
      metadata: agentJobCredentialMetadata({ jobId: args.jobId, attempt: args.attempt, runnerId: args.runnerId }),
    });
    if (!key) return { ok: false, reason: "ownerInactive" };
    return { ok: true, credentials: { token: key.key, url: `${this.baseUrl}${MCP_ENDPOINT_PATH}` } };
  }

  toolCalls(args: AgentJobAttemptRef): Promise<number> {
    return this.auth.apiKeyRequestsNamed(args.companyId, agentJobKeyName(args.jobId, args.attempt));
  }

  async revoke(args: AgentJobAttemptRef): Promise<void> {
    await this.auth.revokeApiKeysNamed(args.companyId, agentJobKeyName(args.jobId, args.attempt));
  }
}
