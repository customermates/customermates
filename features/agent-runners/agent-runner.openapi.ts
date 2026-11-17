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
  AgentJobStartBodySchema,
  AgentJobStartResultSchema,
  AgentRunnerHeartbeatBodySchema,
  AgentRunnerHeartbeatResultSchema,
} from "./agent-runner.schema";

const AUTHENTICATION =
  "a runner token in the Authorization header (`Bearer cmr_...`), shown once when the runner is added under Settings, Agents. The token is checked before the body is read: an unknown token answers 401 and a rate-limited runner 429 without the body being parsed, and a body that declares more than 512 KB answers 400. A revoked token, a runner whose member left the workspace or was deactivated, or a workspace that is being deleted, answers 401.";

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
        "Records the machine and the command line clients (Claude Code, Codex, Gemini CLI) the runner can start and marks the runner as last seen now. A runner counts as online for two minutes after its last heartbeat, a claim request also counts. The daemon sends one every 60 seconds.",
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
        "Long poll: holds the request open for up to 25 seconds and answers 200 with the oldest queued runner job of the member who added this runner, or 204 when none arrived. A runner never receives a job of another member. The wait ends when the runner closes the connection. The runner confirms the job with the start call within confirmWithinSeconds; a job that is not confirmed returns to the queue. The answer carries the workspace MCP endpoint and a key for this attempt of this job. The key works only between the start call and the end of the job, only on the MCP endpoint, for at most 25 tool calls, and it refuses the calls that need a person's approval. promptUntrusted is true when outsiders can influence the prompt, so the runner presents it to the client as data, not as instructions.",
      input: AgentJobClaimBodySchema,
      example: {},
      output: AgentJobClaimResultSchema,
      outputDescription: "The claimed job and its MCP credentials.",
      extraResponses: { "204": { description: "No job became available within the wait." } },
    }),
  },
  "/v1/runner/jobs/{id}/start": {
    post: runnerOperation({
      operationId: "startRunnerJob",
      summary: "Confirm a claimed job and start it",
      description:
        "Tells the server that the runner received the job. The job moves from claimed to running, its key starts to work and its ten minutes begin. The answer gives the time the client may run in seconds, 20 seconds less than the server keeps the job open, so the runner's own timedOut report arrives in time; the runner counts it on a local timer, so a wrong clock on its machine does not matter. Repeating the call for a running attempt answers the time that is left. A job that is not claimed by this runner answers 404; a job that is closed, was claimed again as another attempt, or was not confirmed within confirmWithinSeconds, answers 409. The job's key stops working when the server's time for the job is over.",
      input: AgentJobStartBodySchema,
      example: { attempt: 1 },
      output: AgentJobStartResultSchema,
      outputDescription: "The time the client may run.",
      withJobId: true,
    }),
  },
  "/v1/runner/jobs/{id}/events": {
    post: runnerOperation({
      operationId: "appendRunnerJobEvents",
      summary: "Stream transcript events of a job",
      description:
        "Appends up to 100 events to the job's transcript in the shape the workspace shows: a message of the agent, a tool call, a tool result or the finish. The transcript keeps the last 200 events. A job that is not claimed by this runner answers 404; a job that is already finished, timed out or cancelled, or that runs as another attempt, answers 409, which tells the runner to stop the client.",
      input: AgentJobEventsBodySchema,
      example: {
        attempt: 1,
        events: [
          { type: "message", at: "2026-11-17T09:00:05.000Z", role: "assistant", text: "Looking at the open deals" },
        ],
      },
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
        "Ends the job as succeeded, failed or timedOut with the client's final answer and, when the client reports them, its token counts. A runner job has no Customermates cost, so none is stored. The job's MCP key is revoked. A job that is already closed, or that runs as another attempt, answers 409 and keeps its result.",
      input: AgentJobResultBodySchema,
      example: {
        attempt: 1,
        status: "succeeded",
        summary: "Three deals need a follow-up.",
        inputTokens: 1200,
        outputTokens: 300,
      },
      output: AgentJobFinishResultSchema,
      outputDescription: "Confirmation that the result was stored.",
      withJobId: true,
    }),
  },
};
