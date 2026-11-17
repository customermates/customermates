export type AgentRunnerPresence = {
  id: string;
  name: string;
  lastSeenAt: Date | null;
};

export abstract class AgentRunnerPresenceRepo {
  abstract findActive(): Promise<AgentRunnerPresence[]>;
}
