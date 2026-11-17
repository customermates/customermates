import type { CausationContext } from "@/core/decorators/causation-context";

import { AsyncLocalStorage } from "node:async_hooks";

export type AgentJobRequest = {
  keyId: string;
  companyId: string;
  jobId: string;
  attempt: number;
  ruleChain: readonly string[];
  untrusted: boolean;
};

const storage = new AsyncLocalStorage<AgentJobRequest>();

export function runAsAgentJobRequest<T>(request: AgentJobRequest, fn: () => T | Promise<T>): Promise<T> {
  return storage.run(request, () => Promise.resolve(fn()));
}

export function currentAgentJobRequest(): AgentJobRequest | undefined {
  return storage.getStore();
}

export function admitsAgentJobKey(keyId: string): boolean {
  return storage.getStore()?.keyId === keyId;
}

export function agentJobRequestCausation(
  request: Pick<AgentJobRequest, "ruleChain" | "untrusted">,
): CausationContext {
  return {
    routineDepth: 1,
    ruleChain: [...request.ruleChain],
    ...(request.untrusted ? { untrustedOrigin: true } : {}),
  };
}
