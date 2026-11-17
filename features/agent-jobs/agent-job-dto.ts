import type { TenantUser } from "@/features/user/user.schema";
import type { AgentJobDetail, AgentJobResult, AgentJobSummary, AgentTranscriptEvent } from "./agent-job.schema";
import type { StoredAgentJob, StoredAgentJobSummary } from "./agent-job.repo";

import { AgentJobResultSchema, AgentTranscriptEventSchema } from "./agent-job.schema";

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

export function toAgentJobSummary(job: StoredAgentJobSummary, withContent = true): AgentJobSummary {
  return {
    id: job.id,
    runtime: job.runtime,
    status: job.status,
    sourceKind: job.sourceKind,
    sourceId: job.sourceId,
    model: job.model,
    runnerId: job.runnerId ?? job.pinnedRunnerId,
    attempts: job.attempts,
    inputTokens: job.inputTokens,
    outputTokens: job.outputTokens,
    costMicrocents: job.costMicrocents === null ? null : Number(job.costMicrocents),
    error: job.error,
    result: withContent ? parsedResult(job.result) : null,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
  };
}

export function toAgentJobDetail(job: StoredAgentJob, withContent = true): AgentJobDetail {
  if (!withContent) {
    return {
      ...toAgentJobSummary(job, false),
      prompt: "",
      promptUntrusted: job.promptUntrusted,
      transcript: [],
      restricted: true,
    };
  }
  return {
    ...toAgentJobSummary(job),
    prompt: job.prompt,
    promptUntrusted: job.promptUntrusted,
    transcript: parsedTranscript(job.transcript),
  };
}
