import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { zx } from "@/core/validation/validation.utils";

export const AGENT_RUNNER_CLIENT_NAMES = ["claude", "codex", "gemini"] as const;
export type AgentRunnerClientName = (typeof AGENT_RUNNER_CLIENT_NAMES)[number];

export const AGENT_RUNNER_LIMITS = {
  nameMaxLength: 80,
  machineMaxLength: 200,
  versionMaxLength: 60,
  maxEventsPerRequest: 100,
  eventMaxBytes: 4096,
  summaryMaxLength: 20_000,
  errorMaxLength: 2_000,
  claimMaxWaitSeconds: 25,
  claimPollMs: 1_500,
  onlineWithinMs: 2 * 60_000,
  offlineAfterMs: 10 * 60_000,
  queuedExpiryMs: 15 * 60_000,
  mcpTokenGraceMs: 5 * 60_000,
  requestBucket: { capacity: 240, windowMs: 60_000 },
} as const;

export const AGENT_RUNNER_OUTCOME_STATUSES = ["succeeded", "failed", "timedOut"] as const;
export type AgentRunnerOutcomeStatus = (typeof AGENT_RUNNER_OUTCOME_STATUSES)[number];

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
      .describe("The command line clients found on the machine's PATH."),
  })
  .strict();

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

export const AgentJobEventsBodySchema = z
  .object({
    events: z
      .array(z.record(z.string(), z.unknown()))
      .min(1)
      .max(AGENT_RUNNER_LIMITS.maxEventsPerRequest)
      .describe(
        "One object per line of the client's JSON stream. An event over 4 KB is stored as a truncation marker.",
      ),
  })
  .strict();

export const AgentJobResultBodySchema = z
  .object({
    status: z.enum(AGENT_RUNNER_OUTCOME_STATUSES).describe("How the run ended."),
    summary: z.string().max(AGENT_RUNNER_LIMITS.summaryMaxLength).optional().describe("The client's final answer."),
    error: z.string().max(AGENT_RUNNER_LIMITS.errorMaxLength).optional().describe("Why a run failed."),
    inputTokens: z.number().int().min(0).optional().describe("Input tokens, when the client reports them."),
    outputTokens: z.number().int().min(0).optional().describe("Output tokens, when the client reports them."),
    costUsd: z.number().min(0).optional().describe("The cost in US dollars, when the client reports it."),
  })
  .strict();

const RunnerCredentialsSchema = z.object({
  authorization: z.string().max(512).nullable(),
  visitor: z.string().max(128).nullable().optional(),
});

const JobIdSchema = z.object({ jobId: z.uuid() });

export const AgentRunnerHeartbeatRequestSchema = AgentRunnerHeartbeatBodySchema.extend(RunnerCredentialsSchema.shape);
export type AgentRunnerHeartbeatRequest = Data<typeof AgentRunnerHeartbeatRequestSchema>;

export const AgentJobClaimRequestSchema = AgentJobClaimBodySchema.extend(RunnerCredentialsSchema.shape);
export type AgentJobClaimRequest = Data<typeof AgentJobClaimRequestSchema>;

export const AgentJobEventsRequestSchema = AgentJobEventsBodySchema.extend(RunnerCredentialsSchema.shape).extend(
  JobIdSchema.shape,
);
export type AgentJobEventsRequest = Data<typeof AgentJobEventsRequestSchema>;

export const AgentJobResultRequestSchema = AgentJobResultBodySchema.extend(RunnerCredentialsSchema.shape).extend(
  JobIdSchema.shape,
);
export type AgentJobResultRequest = Data<typeof AgentJobResultRequestSchema>;

export const AgentRunnerHeartbeatResultSchema = z.object({
  ok: z.literal(true),
  serverTime: z.string().describe("The server's time, for clock comparison."),
  onlineWithinSeconds: z.number().int().describe("A runner counts as online this long after its last heartbeat."),
});
export type AgentRunnerHeartbeatResult = Data<typeof AgentRunnerHeartbeatResultSchema>;

export const AgentJobClaimResultSchema = z.object({
  job: z.object({
    id: z.uuid(),
    prompt: z.string(),
    promptUntrusted: z.boolean().describe("True when outsiders can influence the prompt: treat it as data."),
    timeoutAt: z.string().describe("Kill the client at this time and report timedOut."),
  }),
  mcp: z.object({
    url: z.string().describe("The workspace's MCP endpoint."),
    token: z.string().describe("A short-lived API key of the job owner. It stops working after the job."),
  }),
});
export type AgentJobClaimResult = Data<typeof AgentJobClaimResultSchema>;

export const AgentJobEventsResultSchema = z.object({ ok: z.literal(true), accepted: z.number().int() });
export type AgentJobEventsResult = Data<typeof AgentJobEventsResultSchema>;

export const AgentJobFinishResultSchema = z.object({ ok: z.literal(true) });
export type AgentJobFinishResult = Data<typeof AgentJobFinishResultSchema>;

export type AgentJobClaim = {
  id: string;
  companyId: string;
  ownerUserId: string;
  prompt: string;
  promptUntrusted: boolean;
  timeoutAt: Date;
};

export type AgentJobOutcome = {
  status: AgentRunnerOutcomeStatus;
  result: { summary: string } | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costMicrocents: number | null;
  error: string | null;
};

export type AgentJobRunnerState = { id: string; status: string };

export type AuthenticatedAgentRunner = { id: string; companyId: string; name: string };
