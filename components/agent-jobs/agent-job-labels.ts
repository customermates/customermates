import type { useTranslations } from "next-intl";
import type { AgentJobFinishReason, AgentJobStatusValue } from "@/features/agent-jobs/agent-job.schema";

import { agentJobErrorParts } from "@/features/agent-jobs/agent-job-dto";

type Translator = ReturnType<typeof useTranslations>;

export function agentJobStatusLabel(t: Translator, status: AgentJobStatusValue): string {
  switch (status) {
    case "queued":
      return t("AgentJobs.status.queued");
    case "claimed":
      return t("AgentJobs.status.claimed");
    case "running":
      return t("AgentJobs.status.running");
    case "succeeded":
      return t("AgentJobs.status.succeeded");
    case "failed":
      return t("AgentJobs.status.failed");
    case "timedOut":
      return t("AgentJobs.status.timedOut");
    case "cancelled":
      return t("AgentJobs.status.cancelled");
  }
}

export function agentJobFinishLabel(t: Translator, reason: AgentJobFinishReason): string {
  switch (reason) {
    case "stop":
      return t("AgentJobs.transcript.finish.stop");
    case "toolLimit":
      return t("AgentJobs.transcript.finish.toolLimit");
    case "timeLimit":
      return t("AgentJobs.transcript.finish.timeLimit");
    case "creditLimit":
      return t("AgentJobs.transcript.finish.creditLimit");
    case "error":
      return t("AgentJobs.transcript.finish.error");
    case "cancelled":
      return t("AgentJobs.transcript.finish.cancelled");
  }
}

export function agentJobErrorLabel(t: Translator, error: string): string {
  const { code, detail } = agentJobErrorParts(error);
  if (detail !== null) return t("AgentJobs.errors.runnerFailedDetail", { detail });
  switch (code) {
    case "creditsExhausted":
      return t("AgentJobs.errors.creditsExhausted");
    case "hostedAiUnavailable":
      return t("AgentJobs.errors.hostedAiUnavailable");
    case "noKey":
      return t("AgentJobs.errors.noKey");
    case "keyUnreadable":
      return t("AgentJobs.errors.keyUnreadable");
    case "modelUnavailable":
      return t("AgentJobs.errors.modelUnavailable");
    case "ownerInactive":
      return t("AgentJobs.errors.ownerInactive");
    case "ownerApiAccess":
      return t("AgentJobs.errors.ownerApiAccess");
    case "planRequired":
      return t("AgentJobs.errors.planRequired");
    case "planApiAccess":
      return t("AgentJobs.errors.planApiAccess");
    case "contextLimit":
      return t("AgentJobs.errors.contextLimit");
    case "modelRequired":
      return t("AgentJobs.errors.modelRequired");
    case "queueExpired":
      return t("AgentJobs.errors.queueExpired");
    case "runnerRevoked":
      return t("AgentJobs.errors.runnerRevoked");
    case "ruleInactive":
      return t("AgentJobs.errors.ruleInactive");
    case "runnerStopped":
      return t("AgentJobs.errors.runnerStopped");
    case "runnerFailed":
      return t("AgentJobs.errors.runnerFailed");
    case "timedOut":
      return t("AgentJobs.errors.timedOut");
    case "toolLimit":
      return t("AgentJobs.errors.toolLimit");
    case "creditLimit":
      return t("AgentJobs.errors.creditLimit");
    case "timeLimit":
      return t("AgentJobs.errors.timeLimit");
    default:
      return t("AgentJobs.errors.provider", { code });
  }
}
