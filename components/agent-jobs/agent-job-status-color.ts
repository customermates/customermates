import type { ChipColor } from "@/constants/chip-colors";
import type { AgentJobStatusValue } from "@/features/agent-jobs/agent-job.schema";

export const AGENT_JOB_STATUS_CHIP_COLOR: Record<AgentJobStatusValue, ChipColor> = {
  queued: "secondary",
  claimed: "info",
  running: "info",
  succeeded: "success",
  failed: "destructive",
  timedOut: "warning",
  cancelled: "secondary",
};
