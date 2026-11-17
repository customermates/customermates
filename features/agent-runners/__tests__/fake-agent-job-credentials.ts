import type { AgentJobMcpCredentials } from "../agent-job-credentials";

import { AgentJobCredentials } from "../agent-job-credentials";

export class FakeAgentJobCredentials extends AgentJobCredentials {
  issued: Array<{ companyId: string; ownerUserId: string; jobId: string; expiresAt: Date }> = [];
  revoked: Array<{ companyId: string; jobId: string }> = [];
  available = true;
  revokeFails = false;

  issue(args: {
    companyId: string;
    ownerUserId: string;
    jobId: string;
    expiresAt: Date;
  }): Promise<AgentJobMcpCredentials | null> {
    this.issued.push(args);
    return Promise.resolve(
      this.available ? { url: `https://app.example.test/api/v1/mcp/w/${args.companyId}`, token: "job-key" } : null,
    );
  }

  revoke(args: { companyId: string; jobId: string }): Promise<void> {
    this.revoked.push(args);
    return this.revokeFails ? Promise.reject(new Error("revoke failed")) : Promise.resolve();
  }
}
