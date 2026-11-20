import type { TenantUser } from "@/features/user/user.schema";
import type {
  AgentJobDetail,
  AgentJobResult,
  AgentJobRule,
  AgentJobSummary,
  AgentTranscriptEvent,
} from "./agent-job.schema";
import type { StoredAgentJob, StoredAgentJobSummary } from "./agent-job.repo";

import { z } from "zod";

import { AgentJobResultSchema, AgentTranscriptEventSchema } from "./agent-job.schema";

export const AGENT_JOB_ERROR_TEXT_KEY = "errorText";
export const AGENT_JOB_DETAILED_ERROR = "runnerFailed";

const ERROR_DETAIL_SEPARATOR = ": ";
const StoredErrorTextSchema = z.object({ [AGENT_JOB_ERROR_TEXT_KEY]: z.string().trim().min(1) });

export function agentJobErrorParts(error: string): { code: string; detail: string | null } {
  const prefix = `${AGENT_JOB_DETAILED_ERROR}${ERROR_DETAIL_SEPARATOR}`;
  if (!error.startsWith(prefix) || error.length === prefix.length) return { code: error, detail: null };
  return { code: AGENT_JOB_DETAILED_ERROR, detail: error.slice(prefix.length) };
}

function errorWithText(job: Pick<StoredAgentJobSummary, "error" | "result">): string | null {
  if (job.error !== AGENT_JOB_DETAILED_ERROR) return job.error;
  const stored = StoredErrorTextSchema.safeParse(job.result);
  return stored.success ? `${job.error}${ERROR_DETAIL_SEPARATOR}${stored.data[AGENT_JOB_ERROR_TEXT_KEY]}` : job.error;
}

function parsedResult(value: StoredAgentJob["result"]): AgentJobResult | null {
  const parsed = AgentJobResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parsedTranscript(value: StoredAgentJob["transcript"]): AgentTranscriptEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = AgentTranscriptEventSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function mayReadAgentJobContent(
  user: Pick<TenantUser, "id" | "role">,
  job: Pick<StoredAgentJobSummary, "ownerUserId">,
): boolean {
  return job.ownerUserId === user.id || user.role?.isSystemRole === true;
}

export function toAgentJobSummary(
  job: StoredAgentJobSummary,
  withContent = true,
  rule: AgentJobRule | null = null,
): AgentJobSummary {
  return {
    id: job.id,
    runtime: job.runtime,
    status: job.status,
    sourceKind: job.sourceKind,
    sourceId: job.sourceId,
    rule,
    model: job.model,
    runnerId: job.runnerId ?? job.pinnedRunnerId,
    attempts: job.attempts,
    inputTokens: job.inputTokens,
    outputTokens: job.outputTokens,
    costMicrocents: job.costMicrocents === null ? null : Number(job.costMicrocents),
    error: withContent ? errorWithText(job) : job.error,
    result: withContent ? parsedResult(job.result) : null,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
  };
}

export function toAgentJobDetail(
  job: StoredAgentJob,
  withContent = true,
  rule: AgentJobRule | null = null,
): AgentJobDetail {
  if (!withContent) {
    return {
      ...toAgentJobSummary(job, false, rule),
      prompt: "",
      promptUntrusted: job.promptUntrusted,
      transcript: [],
      restricted: true,
    };
  }
  return {
    ...toAgentJobSummary(job, true, rule),
    prompt: job.prompt,
    promptUntrusted: job.promptUntrusted,
    transcript: parsedTranscript(job.transcript),
  };
}
