import { z } from "zod";

const CHANNEL_NAME = "customermates:workspace";

const WorkspaceTabMessageSchema = z.object({
  source: z.string(),
  companyId: z.string().nullable(),
  name: z.string().nullable(),
  deletedCompanyId: z.string().nullish(),
});

export type WorkspaceTabNotice = { companyId: string | null; name: string | null; deletedCompanyId?: string };

type Listener = (notice: WorkspaceTabNotice) => void;

export class WorkspaceTabChannel {
  private readonly source = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  private channel: BroadcastChannel | null = null;

  open(listener: Listener): () => void {
    if (typeof BroadcastChannel === "undefined") return () => undefined;

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = WorkspaceTabMessageSchema.safeParse(event.data);
      if (!message.success || message.data.source === this.source) return;
      const { companyId, name, deletedCompanyId } = message.data;
      listener(deletedCompanyId ? { companyId, name, deletedCompanyId } : { companyId, name });
    };
    this.channel = channel;

    return () => {
      channel.close();
      if (this.channel === channel) this.channel = null;
    };
  }

  post(notice: WorkspaceTabNotice): void {
    if (typeof BroadcastChannel === "undefined") return;

    const message = {
      source: this.source,
      companyId: notice.companyId,
      name: notice.name,
      deletedCompanyId: notice.deletedCompanyId ?? null,
    };
    if (this.channel) {
      this.channel.postMessage(message);
      return;
    }

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
  }
}
