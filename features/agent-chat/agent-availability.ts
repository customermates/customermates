import { AgentSessionUnavailableError } from "@/core/errors/app-errors";
import { env } from "@/env";

export function isAgentChatAvailable() {
  return env.APP_MODE === "cloud" && !env.AGENT_CHAT_DISABLED;
}

export function RequiresAgentChat(_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;

  descriptor.value = function (...args: unknown[]) {
    if (!isAgentChatAvailable())
      return Promise.reject(new AgentSessionUnavailableError("The assistant is not available here."));

    return originalMethod.apply(this, args);
  };
}
