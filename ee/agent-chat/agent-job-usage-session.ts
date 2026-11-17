export const AGENT_JOB_USAGE_SESSION_PREFIX = "agent-job:";

export function agentJobUsageSessionId(jobId: string, attempt: number): string {
  return `${AGENT_JOB_USAGE_SESSION_PREFIX}${jobId}:${attempt}`;
}
