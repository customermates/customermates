export type AgentJobCreditsRelease = {
  jobId: string;
  attempt: number;
  companyId: string;
  userId: string;
};

export type AgentJobCredits = {
  release(args: AgentJobCreditsRelease): Promise<void>;
  settleInterrupted(args: AgentJobCreditsRelease): Promise<"retained" | "released" | "none">;
};
