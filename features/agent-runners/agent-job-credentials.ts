export type AgentJobMcpCredentials = { url: string; token: string };

export abstract class AgentJobCredentials {
  abstract issue(args: {
    companyId: string;
    ownerUserId: string;
    jobId: string;
    expiresAt: Date;
  }): Promise<AgentJobMcpCredentials | null>;
  abstract revoke(args: { companyId: string; jobId: string }): Promise<void>;
}
