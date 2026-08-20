import { env } from "@/env";

export function isAgentChatAvailable() {
  return env.APP_MODE === "cloud" && !env.AGENT_CHAT_DISABLED;
}
