import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { zx } from "@/core/validation/validation.utils";
import {
  AGENT_JOB_FINISH_REASONS,
  AGENT_JOB_SUMMARY_MAX_CHARS,
  AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS,
} from "@/features/agent-jobs/agent-job.schema";

export const AGENT_RUNNER_CLIENT_NAMES = ["claude", "codex", "gemini"] as const;
export type AgentRunnerClientName = (typeof AGENT_RUNNER_CLIENT_NAMES)[number];

export const AGENT_RUNNER_LIMITS = {
  nameMaxLength: 80,
  machineMaxLength: 200,
  versionMaxLength: 60,
  maxEventsPerRequest: 100,
  maxBodyBytes: 512 * 1024,
  summaryMaxLength: AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS,
  errorMaxLength: 2_000,
  claimMaxWaitSeconds: 25,
  claimPollMs: 1_500,
  claimCandidates: 5,
  claimConfirmMs: 60_000,
  onlineWithinMs: 2 * 60_000,
  offlineAfterMs: 10 * 60_000,
  queuedExpiryMs: 15 * 60_000,
  mcpTokenGraceMs: 5 * 60_000,
  requestBucket: { capacity: 240, windowMs: 60_000 },
} as const;

export const AGENT_RUNNER_OUTCOME_STATUSES = ["succeeded", "failed", "timedOut"] as const;
export type AgentRunnerOutcomeStatus = (typeof AGENT_RUNNER_OUTCOME_STATUSES)[number];

export const AGENT_RUNNER_JOB_ERRORS = {
  ownerInactive: "ownerInactive",
  ownerApiAccess: "ownerApiAccess",
  planRequired: "planRequired",
  failed: "runnerFailed",
  timedOut: "timedOut",
} as const;

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function storableText(maxLength: number) {
  return zx
    .nulFreeText()
    .max(maxLength)
    .superRefine((value, ctx) => {
      if (LONE_SURROGATE.test(value))
        ctx.addIssue({ code: "custom", message: "Text must not contain an unpaired surrogate character" });
    });
}

export const AgentRunnerClientSchema = z
  .object({
    name: z.enum(AGENT_RUNNER_CLIENT_NAMES).describe("The command line client the runner found."),
    version: z.string().trim().min(1).max(AGENT_RUNNER_LIMITS.versionMaxLength).describe("Its reported version."),
  })
  .strict();
export type AgentRunnerClient = Data<typeof AgentRunnerClientSchema>;

export const AgentRunnerDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  machine: z.string().nullable(),
  clients: z.array(AgentRunnerClientSchema),
  lastSeenAt: z.string().nullable(),
  online: z.boolean(),
  revokedAt: z.string().nullable(),
  createdById: z.uuid(),
  createdAt: z.string(),
});
export type AgentRunnerDto = Data<typeof AgentRunnerDtoSchema>;

export const GetAgentRunnersResultSchema = z.object({ runners: z.array(AgentRunnerDtoSchema) });
export type GetAgentRunnersResult = Data<typeof GetAgentRunnersResultSchema>;

export const CreateAgentRunnerSchema = z.object({ name: zx.nonBlankText(AGENT_RUNNER_LIMITS.nameMaxLength) }).strict();
export type CreateAgentRunnerData = Data<typeof CreateAgentRunnerSchema>;

export const CreateAgentRunnerResultSchema = z.object({
  runner: AgentRunnerDtoSchema,
  token: z.string(),
  url: z.string(),
});
export type CreateAgentRunnerResult = Data<typeof CreateAgentRunnerResultSchema>;

export const RevokeAgentRunnerSchema = z.object({ id: z.uuid() }).strict();
export type RevokeAgentRunnerData = Data<typeof RevokeAgentRunnerSchema>;

export const RevokeAgentRunnerResultSchema = z.object({ id: z.uuid(), revokedAt: z.string() });
export type RevokeAgentRunnerResult = Data<typeof RevokeAgentRunnerResultSchema>;

export const AgentRunnerHeartbeatBodySchema = z
  .object({
    machine: z
      .string()
      .trim()
      .min(1)
      .max(AGENT_RUNNER_LIMITS.machineMaxLength)
      .optional()
      .describe("A name for the machine the runner runs on, such as its host name."),
    clients: z
      .array(AgentRunnerClientSchema)
      .max(AGENT_RUNNER_CLIENT_NAMES.length)
      .refine((clients) => new Set(clients.map((client) => client.name)).size === clients.length, {
        message: "Each client can be listed once",
      })
      .describe("The command line clients the runner can start: found on the machine and answering with a version."),
  })
  .strict();
export type AgentRunnerHeartbeatBody = Data<typeof AgentRunnerHeartbeatBodySchema>;

export const AgentJobClaimBodySchema = z
  .object({
    waitSeconds: z
      .number()
      .int()
      .min(0)
      .max(AGENT_RUNNER_LIMITS.claimMaxWaitSeconds)
      .optional()
      .describe("How long to hold the request open for a job, at most 25 seconds. Defaults to 25."),
  })
  .strict();
export type AgentJobClaimBody = Data<typeof AgentJobClaimBodySchema>;

const AttemptSchema = z
  .number()
  .int()
  .min(1)
  .describe("The attempt number the claim answered with. A job that was requeued and claimed again has a higher one.");

export const AgentJobStartBodySchema = z.object({ attempt: AttemptSchema }).strict();
export type AgentJobStartBody = Data<typeof AgentJobStartBodySchema>;

const EventTimeSchema = z.iso.datetime({ offset: true }).describe("When the client produced the event.");
const ToolCallIdSchema = storableText(120);
const ToolNameSchema = storableText(120);

export const AgentRunnerTranscriptEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    at: EventTimeSchema,
    role: z.literal("assistant"),
    text: storableText(AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS),
  }),
  z.object({
    type: z.literal("toolCall"),
    at: EventTimeSchema,
    toolCallId: ToolCallIdSchema,
    name: ToolNameSchema,
    argumentsDigest: storableText(AGENT_JOB_SUMMARY_MAX_CHARS),
  }),
  z.object({
    type: z.literal("toolResult"),
    at: EventTimeSchema,
    toolCallId: ToolCallIdSchema,
    name: ToolNameSchema,
    ok: z.boolean(),
    summary: storableText(AGENT_JOB_SUMMARY_MAX_CHARS),
  }),
  z.object({
    type: z.literal("finish"),
    at: EventTimeSchema,
    reason: z.enum(AGENT_JOB_FINISH_REASONS),
    text: storableText(AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS).optional(),
  }),
]);
export type AgentRunnerTranscriptEvent = Data<typeof AgentRunnerTranscriptEventSchema>;

export const AgentJobEventsBodySchema = z
  .object({
    attempt: AttemptSchema,
    events: z
      .array(AgentRunnerTranscriptEventSchema)
      .min(1)
      .max(AGENT_RUNNER_LIMITS.maxEventsPerRequest)
      .describe(
        "Transcript events in the shape the workspace shows: a message of the agent, a tool call, a tool result or the finish. Unknown keys are dropped.",
      ),
  })
  .strict();
export type AgentJobEventsBody = Data<typeof AgentJobEventsBodySchema>;

export const AgentJobResultBodySchema = z
  .object({
    attempt: AttemptSchema,
    status: z.enum(AGENT_RUNNER_OUTCOME_STATUSES).describe("How the run ended."),
    summary: storableText(AGENT_RUNNER_LIMITS.summaryMaxLength).optional().describe("The client's final answer."),
    error: storableText(AGENT_RUNNER_LIMITS.errorMaxLength).optional().describe("Why a run failed."),
    inputTokens: z.number().int().min(0).optional().describe("Input tokens, when the client reports them."),
    outputTokens: z.number().int().min(0).optional().describe("Output tokens, when the client reports them."),
  })
  .strict();
export type AgentJobResultBody = Data<typeof AgentJobResultBodySchema>;

export type AgentRunnerBodyReader = () => Promise<unknown>;

const RunnerRequestSchema = z.object({
  authorization: z.string().max(512).nullable(),
  visitor: z.string().max(128).nullable().optional(),
  readBody: z.custom<AgentRunnerBodyReader>((value) => typeof value === "function"),
  signal: z.custom<AbortSignal>((value) => value instanceof AbortSignal).optional(),
});

const JobIdSchema = z.object({ jobId: z.uuid() });

export const AgentRunnerRequestSchema = RunnerRequestSchema;
export type AgentRunnerRequest = Data<typeof AgentRunnerRequestSchema>;

export const AgentRunnerJobRequestSchema = RunnerRequestSchema.extend(JobIdSchema.shape);
export type AgentRunnerJobRequest = Data<typeof AgentRunnerJobRequestSchema>;

export const AgentRunnerHeartbeatResultSchema = z.object({
  ok: z.literal(true),
  serverTime: z.string().describe("The server's time, for clock comparison."),
  onlineWithinSeconds: z.number().int().describe("A runner counts as online this long after its last heartbeat."),
});
export type AgentRunnerHeartbeatResult = Data<typeof AgentRunnerHeartbeatResultSchema>;

export const AgentJobClaimResultSchema = z.object({
  job: z.object({
    id: z.uuid(),
    attempt: z.number().int().describe("Echo this number on the start, events and result calls of the job."),
    prompt: z.string(),
    promptUntrusted: z.boolean().describe("True when outsiders can influence the prompt: treat it as data."),
    confirmWithinSeconds: z
      .number()
      .int()
      .describe("Call start within this time, or the job returns to the queue and its key never works."),
  }),
  mcp: z.object({
    url: z.string().describe("The workspace's MCP endpoint."),
    token: z
      .string()
      .describe("A key for this attempt of this job only. It works from the start call until the job ends."),
  }),
});
export type AgentJobClaimResult = Data<typeof AgentJobClaimResultSchema>;

export const AgentJobStartResultSchema = z.object({
  ok: z.literal(true),
  timeoutInSeconds: z
    .number()
    .int()
    .describe("Stop the client after this many seconds from now and report timedOut. Count it on a local timer."),
});
export type AgentJobStartResult = Data<typeof AgentJobStartResultSchema>;

export const AgentJobEventsResultSchema = z.object({ ok: z.literal(true), accepted: z.number().int() });
export type AgentJobEventsResult = Data<typeof AgentJobEventsResultSchema>;

export const AgentJobFinishResultSchema = z.object({ ok: z.literal(true) });
export type AgentJobFinishResult = Data<typeof AgentJobFinishResultSchema>;

export type AgentJobClaim = {
  id: string;
  companyId: string;
  ownerUserId: string;
  attempt: number;
  prompt: string;
  promptUntrusted: boolean;
  confirmBy: Date;
};

export type AgentJobOutcome = {
  status: AgentRunnerOutcomeStatus;
  result: { text: string; reason: (typeof AGENT_JOB_FINISH_REASONS)[number]; toolCalls: number } | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
};

export type AuthenticatedAgentRunner = { id: string; companyId: string; name: string; createdById: string };
