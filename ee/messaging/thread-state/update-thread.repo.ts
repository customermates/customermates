import type { MessagingThreadState } from "../messaging.schema";

export abstract class UpdateThreadRepo {
  abstract setThreadState(args: { threadId: string; state: MessagingThreadState }): Promise<void>;
  abstract setThreadSharedToCrm(args: { threadId: string; shared: boolean }): Promise<void>;
}
