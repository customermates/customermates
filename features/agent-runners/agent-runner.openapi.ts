import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";

import {
  AgentJobClaimBodySchema,
  AgentJobClaimResultSchema,
  AgentJobEventsBodySchema,
  AgentJobEventsResultSchema,
  AgentJobFinishResultSchema,
  AgentJobResultBodySchema,
  AgentRunnerHeartbeatBodySchema,
  AgentRunnerHeartbeatResultSchema,
} from "./agent-runner.schema";

const AUTHENTICATION =
  "a runner token in the Authorization header (`Bearer cmr_...`), shown once when the runner is added under Settings, Agents. A revoked token, or a workspace that is being deleted, answers 401.";

const JobPathSchema = z.object({ id: z.uuid().describe("The id of the job the runner claimed.") });

type RunnerOperation = {
  operationId: string;
  summary: string;
  description: string;
  input: z.ZodType;
  example: unknown;
  output: z.ZodType;
  outputDescription: string;
  withJobId?: boolean;
  extraResponses?: ZodOpenApiOperationObject["responses"];
};

function runnerOperation(operation: RunnerOperation): ZodOpenApiOperationObject {
  return {
    operationId: operation.operationId,
    summary: operation.summary,
    description: `${operation.description}\n\nRequires: ${AUTHENTICATION}`,
    tags: ["runner"],
    security: [{ runnerTokenAuth: [] }],
    ...(operation.withJobId ? { requestParams: { path: JobPathSchema } } : {}),
    requestBody: {
      required: true,
      content: { "application/json": { schema: operation.input, example: operation.example } },
    },
    responses: {
      "200": {
        description: operation.outputDescription,
        content: { "application/json": { schema: operation.output } },
      },
      ...operation.extraResponses,
      ...StructuredApiResponses,
    },
  };
}

export const agentRunnerApiPaths = {
  "/v1/runner/heartbeat": {
    post: runnerOperation({
      operationId: "heartbeatRunner",
      summary: "Report that a runner is alive",
      description:
        "Records the machine and the command line clients (Claude Code, Codex, Gemini CLI) found on its PATH and marks the runner as last seen now. A runner counts as online for two minutes after its last heartbeat, a claim request also counts. The daemon sends one every 60 seconds.",
      input: AgentRunnerHeartbeatBodySchema,
      example: { machine: "ws-main", clients: [{ name: "claude", version: "2.1.0" }] },
      output: AgentRunnerHeartbeatResultSchema,
      outputDescription: "The server time and how long a heartbeat keeps the runner online.",
    }),
  },
  "/v1/runner/jobs/claim": {
    post: runnerOperation({
      operationId: "claimRunnerJob",
      summary: "Claim the next agent job",
      description:
        "Long poll: holds the request open for up to 25 seconds and answers 200 with the oldest queued job of the workspace whose runtime is runner, or 204 when none arrived. A claimed job belongs to this runner until it reports a result or its timeoutAt passes. The answer carries the workspace MCP endpoint and a short-lived API key of the job owner for the client to use; the key stops working a few minutes after the job's timeout and is revoked when the result is reported. promptUntrusted is true when outsiders can influence the prompt, so the runner presents it to the client as data, not as instructions.",
      input: AgentJobClaimBodySchema,
      example: {},
      output: AgentJobClaimResultSchema,
      outputDescription: "The claimed job and its MCP credentials.",
      extraResponses: { "204": { description: "No job became available within the wait." } },
    }),
  },
  "/v1/runner/jobs/{id}/events": {
    post: runnerOperation({
      operationId: "appendRunnerJobEvents",
      summary: "Stream transcript events of a job",
      description:
        "Appends up to 100 events to the job's transcript, one object per line of the client's JSON stream. An event over 4 KB is stored as a truncation marker. A job that is not claimed by this runner answers 404; a job that is already finished, timed out or cancelled answers 409, which tells the runner to stop the client.",
      input: AgentJobEventsBodySchema,
      example: { events: [{ type: "assistant", text: "Looking at the open deals" }] },
      output: AgentJobEventsResultSchema,
      outputDescription: "How many events were accepted.",
      withJobId: true,
    }),
  },
  "/v1/runner/jobs/{id}/result": {
    post: runnerOperation({
      operationId: "finishRunnerJob",
      summary: "Report the result of a job",
      description:
        "Ends the job as succeeded, failed or timedOut with the client's final answer and, when the client reports them, its token counts and cost in US dollars. The job's MCP key is revoked. A job that is already closed answers 409 and keeps its first result.",
      input: AgentJobResultBodySchema,
      example: { status: "succeeded", summary: "Three deals need a follow-up.", inputTokens: 1200, outputTokens: 300 },
      output: AgentJobFinishResultSchema,
      outputDescription: "Confirmation that the result was stored.",
      withJobId: true,
    }),
  },
};
