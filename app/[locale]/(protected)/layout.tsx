import { isAgentChatAvailable } from "@/features/agent-chat/agent-availability";

import { ProtectedShell } from "./protected-shell";

export const dynamic = "force-dynamic";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell agentChatEnabled={isAgentChatAvailable()}>{children}</ProtectedShell>;
}
