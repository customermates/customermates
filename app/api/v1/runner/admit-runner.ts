import type { AgentRunnerBodyRefusal } from "@/features/agent-runners/agent-runner-admission";
import type { AdmittedAgentRunner } from "@/features/agent-runners/agent-runner.schema";

import { getAgentRunnerAdmission } from "@/core/di";
import { ApiRateLimitExceededError } from "@/core/auth/api-rate-limit-exceeded-error";
import { AuthError, InvalidJsonBodyError } from "@/core/errors/app-errors";
import { visitorKey } from "@/core/network/visitor-key";
import { AGENT_RUNNER_LIMITS } from "@/features/agent-runners/agent-runner.schema";

function rateLimited(retryAfterSeconds: number): ApiRateLimitExceededError {
  const error = new ApiRateLimitExceededError("minute", AGENT_RUNNER_LIMITS.requestBucket.capacity, retryAfterSeconds, {
    plan: "",
    price: "",
    url: "",
  });
  error.message = `Too many runner requests. Retry in ${Math.max(1, retryAfterSeconds)} seconds.`;
  return error;
}

const BODY_REFUSALS: Record<AgentRunnerBodyRefusal, string> = {
  lengthRequired: "Send the request body with a Content-Length header. A body without a declared length is not read.",
  bodyTooLarge: `The request body is larger than ${AGENT_RUNNER_LIMITS.maxBodyBytes / 1024} KB.`,
};

function bodyRefused(message: string): InvalidJsonBodyError {
  const error = new InvalidJsonBodyError();
  error.message = message;
  return error;
}

export async function admitRunner(headers: Headers): Promise<AdmittedAgentRunner> {
  const outcome = await getAgentRunnerAdmission().admit({
    authorization: headers.get("authorization"),
    visitor: await visitorKey({ headers }),
    contentLength: headers.get("content-length"),
  });
  if (outcome.ok) return outcome.admission;
  if (outcome.reason === "rateLimited") throw rateLimited(outcome.retryAfterSeconds);
  if (outcome.reason === "unauthenticated") throw new AuthError();
  throw bodyRefused(BODY_REFUSALS[outcome.reason]);
}
