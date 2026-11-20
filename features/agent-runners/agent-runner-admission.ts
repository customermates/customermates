import type { AgentRunnerAuthenticator } from "./agent-runner-authenticator";

import { AGENT_RUNNER_LIMITS, AdmittedAgentRunner } from "./agent-runner.schema";

export type AgentRunnerAdmissionRequest = {
  authorization: string | null;
  visitor?: string | null;
  contentLength?: string | null;
};

export type AgentRunnerBodyRefusal = "lengthRequired" | "bodyTooLarge";

export type AgentRunnerAdmissionOutcome =
  | { ok: true; admission: AdmittedAgentRunner }
  | { ok: false; reason: "unauthenticated" | AgentRunnerBodyRefusal }
  | { ok: false; reason: "rateLimited"; retryAfterSeconds: number };

const DECLARED_LENGTH = /^\d{1,15}$/;

export function declaredBodyRefusal(contentLength: string | null | undefined): AgentRunnerBodyRefusal | null {
  if (contentLength === null || contentLength === undefined || !DECLARED_LENGTH.test(contentLength))
    return "lengthRequired";
  return Number(contentLength) > AGENT_RUNNER_LIMITS.maxBodyBytes ? "bodyTooLarge" : null;
}

export class AgentRunnerAdmission {
  constructor(private readonly authenticator: Pick<AgentRunnerAuthenticator, "authenticate">) {}

  async admit(request: AgentRunnerAdmissionRequest): Promise<AgentRunnerAdmissionOutcome> {
    const authentication = await this.authenticator.authenticate(request);
    if (!authentication.ok) return authentication;
    const refusal = declaredBodyRefusal(request.contentLength);
    if (refusal) return { ok: false, reason: refusal };
    return { ok: true, admission: new AdmittedAgentRunner(authentication.runner) };
  }
}
