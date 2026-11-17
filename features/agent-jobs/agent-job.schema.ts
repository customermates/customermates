import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { AGENT_RUNTIMES, AUTOMATION_AGENT_PROMPT_MAX_CHARS } from "@/features/automation-rules/automation-rule.schema";

export const AGENT_JOB_MAX_TOOL_CALLS = 25;
export const AGENT_JOB_MAX_WALL_MS = 10 * 60 * 1000;
export const AGENT_JOB_RESERVATION_MAX_AGE_MS = AGENT_JOB_MAX_WALL_MS + 2 * 60 * 1000;
export const AGENT_JOB_MAX_HOSTED_RUNNING_PER_WORKSPACE = 5;
export const AGENT_JOB_PROMPT_MAX_CHARS = 4 * AUTOMATION_AGENT_PROMPT_MAX_CHARS;
export const AGENT_JOB_HOSTED_RUNTIMES = ["mate", "ownKey"] as const;
export const AGENT_JOB_QUEUED_REDISPATCH_MS = 2 * 60 * 1000;
export const AGENT_JOB_ERROR_QUEUE_EXPIRED = "queueExpired";
export const AGENT_JOB_ERROR_RUNNER_REVOKED = "runnerRevoked";
export const AGENT_JOB_ERROR_RULE_INACTIVE = "ruleInactive";
export const AGENT_JOB_RETENTION_DAYS = 90;
export const AGENT_JOB_PAGE_SIZE = 25;
export const AGENT_JOB_TRANSCRIPT_MAX_EVENTS = 200;
export const AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS = 4000;
export const AGENT_JOB_SUMMARY_MAX_CHARS = 300;

export const AGENT_JOB_STATUSES = [
  "queued",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "timedOut",
  "cancelled",
] as const;
export const AgentJobStatusSchema = z.enum(AGENT_JOB_STATUSES);
export type AgentJobStatusValue = z.infer<typeof AgentJobStatusSchema>;

export const AGENT_JOB_FINISHED_STATUSES = ["succeeded", "failed", "timedOut", "cancelled"] as const;
export type AgentJobFinishedStatus = (typeof AGENT_JOB_FINISHED_STATUSES)[number];

export const AgentRuntimeSchema = z.enum(AGENT_RUNTIMES);

export const AGENT_JOB_FINISH_REASONS = [
  "stop",
  "toolLimit",
  "timeLimit",
  "creditLimit",
  "error",
  "cancelled",
] as const;
export const AgentJobFinishReasonSchema = z.enum(AGENT_JOB_FINISH_REASONS);
export type AgentJobFinishReason = z.infer<typeof AgentJobFinishReasonSchema>;

const EventBaseSchema = z.object({ at: z.string() });

export const AgentTranscriptEventSchema = z.discriminatedUnion("type", [
  EventBaseSchema.extend({
    type: z.literal("message"),
    role: z.enum(["user", "assistant"]),
    text: z.string().max(AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS),
  }),
  EventBaseSchema.extend({
    type: z.literal("toolCall"),
    toolCallId: z.string().max(120),
    name: z.string().max(120),
    argumentsDigest: z.string().max(AGENT_JOB_SUMMARY_MAX_CHARS),
  }),
  EventBaseSchema.extend({
    type: z.literal("toolResult"),
    toolCallId: z.string().max(120),
    name: z.string().max(120),
    ok: z.boolean(),
    summary: z.string().max(AGENT_JOB_SUMMARY_MAX_CHARS),
  }),
  EventBaseSchema.extend({
    type: z.literal("finish"),
    reason: AgentJobFinishReasonSchema,
    text: z.string().max(AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS).optional(),
  }),
]);
export type AgentTranscriptEvent = z.infer<typeof AgentTranscriptEventSchema>;

export const AgentJobResultSchema = z.object({
  text: z.string().max(AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS),
  reason: AgentJobFinishReasonSchema,
  toolCalls: z.number().int().min(0),
});
export type AgentJobResult = z.infer<typeof AgentJobResultSchema>;

export const AgentJobSummarySchema = z.object({
  id: z.uuid(),
  runtime: AgentRuntimeSchema,
  status: AgentJobStatusSchema,
  sourceKind: z.string(),
  sourceId: z.string().nullable(),
  model: z.string().nullable(),
  runnerId: z.uuid().nullable(),
  attempts: z.number().int(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  costMicrocents: z.number().int().nullable(),
  error: z.string().nullable(),
  result: AgentJobResultSchema.nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AgentJobSummary = Data<typeof AgentJobSummarySchema>;

export const AgentJobDetailSchema = AgentJobSummarySchema.extend({
  prompt: z.string(),
  promptUntrusted: z.boolean(),
  transcript: z.array(AgentTranscriptEventSchema),
  restricted: z.boolean().optional(),
});
export type AgentJobDetail = Data<typeof AgentJobDetailSchema>;

export const GetAgentJobsSchema = z
  .object({
    status: z.array(AgentJobStatusSchema).max(AGENT_JOB_STATUSES.length).optional(),
    sourceKind: z.string().trim().min(1).max(60).optional(),
    sourceId: z.string().trim().min(1).max(120).optional(),
    cursor: z.string().max(400).nullish(),
  })
  .strict();
export type GetAgentJobsData = z.output<typeof GetAgentJobsSchema>;

export const AgentJobPageSchema = z.object({
  jobs: z.array(AgentJobSummarySchema),
  nextCursor: z.string().nullable(),
});
export type AgentJobPage = Data<typeof AgentJobPageSchema>;

export const GetAgentJobSchema = z.object({ id: z.uuid() }).strict();
export type GetAgentJobData = z.infer<typeof GetAgentJobSchema>;

export const EnqueueAgentJobSchema = z
  .object({
    companyId: z.uuid(),
    runId: z.uuid(),
    idempotencyKey: z.string().trim().min(1).max(200),
    ownerUserId: z.uuid(),
    runtime: AgentRuntimeSchema,
    prompt: z.string().trim().min(1).max(AGENT_JOB_PROMPT_MAX_CHARS),
    promptUntrusted: z.boolean(),
    model: z.string().max(80).nullable(),
    runnerId: z.uuid().nullable(),
    recordRef: z.object({ typeId: z.uuid(), recordId: z.uuid() }).nullable(),
  })
  .strict();
export type EnqueueAgentJobData = z.output<typeof EnqueueAgentJobSchema>;

export const EnqueuedAgentJobSchema = z.object({ jobId: z.uuid() });
export type EnqueuedAgentJob = Data<typeof EnqueuedAgentJobSchema>;

export const AGENT_JOB_SOURCE_AUTOMATION = "automation";
