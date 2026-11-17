export type AgentRunnerPresence = {
  id: string;
  name: string;
  machine: string | null;
  lastSeenAt: Date | null;
};

export abstract class AgentRunnerPresenceRepo {
  abstract findActive(): Promise<AgentRunnerPresence[]>;
}
