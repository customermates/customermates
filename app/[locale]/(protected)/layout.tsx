import { env } from "@/env";

import { ProtectedShell } from "./protected-shell";

export const dynamic = "force-dynamic";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell agentChatEnabled={env.CLOUD_HOSTED && env.AGENT_CHAT_ENABLED}>{children}</ProtectedShell>;
}
