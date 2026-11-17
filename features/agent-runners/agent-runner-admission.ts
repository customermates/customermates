import type { AgentRunnerAuthenticator } from "./agent-runner-authenticator";

import { AGENT_RUNNER_LIMITS, AdmittedAgentRunner } from "./agent-runner.schema";

export type AgentRunnerAdmissionRequest = {
  authorization: string | null;
  visitor?: string | null;
  contentLength?: string | null;
};

export type AgentRunnerAdmissionOutcome =
  | { ok: true; admission: AdmittedAgentRunner }
  | { ok: false; reason: "unauthenticated" | "bodyTooLarge" }
  | { ok: false; reason: "rateLimited"; retryAfterSeconds: number };

export function declaresOversizedBody(contentLength: string | null | undefined): boolean {
  const declared = Number(contentLength ?? "0");
  return Number.isFinite(declared) && declared > AGENT_RUNNER_LIMITS.maxBodyBytes;
}

export class AgentRunnerAdmission {
  constructor(private readonly authenticator: Pick<AgentRunnerAuthenticator, "authenticate">) {}

  async admit(request: AgentRunnerAdmissionRequest): Promise<AgentRunnerAdmissionOutcome> {
    const authentication = await this.authenticator.authenticate(request);
    if (!authentication.ok) return authentication;
    if (declaresOversizedBody(request.contentLength)) return { ok: false, reason: "bodyTooLarge" };
    return { ok: true, admission: new AdmittedAgentRunner(authentication.runner) };
  }
}
