import { env } from "@/env";

export function isAgentChatAvailable() {
  return env.APP_MODE !== "self-hosted" && !env.AGENT_CHAT_DISABLED;
}
