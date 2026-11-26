import type { AgentJobAttemptRef, AgentJobCredentialIssue, AgentJobCredentialRefusal } from "../agent-job-credentials";

import { AgentJobCredentials } from "../agent-job-credentials";

type Issued = AgentJobAttemptRef & { ownerUserId: string; runnerId: string; expiresAt: Date };

export class FakeAgentJobCredentials extends AgentJobCredentials {
  issued: Issued[] = [];
  revoked: AgentJobAttemptRef[] = [];
  refusal: AgentJobCredentialRefusal | null = null;
  used = 0;
  revokeFails = false;

  issue(args: Issued): Promise<AgentJobCredentialIssue> {
    this.issued.push(args);
    return Promise.resolve(
      this.refusal
        ? { ok: false, reason: this.refusal }
        : {
            ok: true,
            credentials: { url: "https://app.example.test/api/v1/mcp", token: "job-key" },
          },
    );
  }

  toolCalls(): Promise<number> {
    return Promise.resolve(this.used);
  }

  revoke(args: AgentJobAttemptRef): Promise<void> {
    this.revoked.push(args);
    return this.revokeFails ? Promise.reject(new Error("revoke failed")) : Promise.resolve();
  }
}
