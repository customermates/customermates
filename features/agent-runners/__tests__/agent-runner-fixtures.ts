import type { InteractorFailure } from "@/core/validation/validation.utils";

import { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";
import { interactorFailureStatus } from "@/core/validation/validation.utils";

import { AgentRunnerAuthenticator } from "../agent-runner-authenticator";

import type { FakeAgentRunnerRepo } from "./fake-agent-runner-repo";

export const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_COMPANY_ID = "22222222-2222-4222-8222-222222222222";
export const OWNER_ID = "33333333-3333-4333-8333-333333333333";
export const RUNNER_ID = "44444444-4444-4444-8444-444444444444";
export const JOB_ID = "55555555-5555-4555-8555-555555555555";

export function makeLimiters(now: () => number = () => Date.now(), capacity = 1_000) {
  return {
    runner: new TokenBucketRateLimiter(capacity, 60_000, 100, now),
    visitor: new TokenBucketRateLimiter(capacity, 60_000, 100, now),
  };
}

export function makeAuthenticator(repo: FakeAgentRunnerRepo, limiters = makeLimiters()) {
  return new AgentRunnerAuthenticator(repo, limiters);
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}

export function statusOf(result: { ok: true } | InteractorFailure): number {
  return result.ok ? 200 : interactorFailureStatus(result.error);
}

export function codeOf(result: { ok: true } | InteractorFailure): string | undefined {
  return result.ok ? undefined : (result.error.issues[0]?.params as { error?: string } | undefined)?.error;
}
