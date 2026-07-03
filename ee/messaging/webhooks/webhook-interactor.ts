import type { UnipileWebhookEnvelope } from "../unipile.schema";

export interface UnipileWebhookHandler {
  invoke(envelope: UnipileWebhookEnvelope): Promise<void>;
}

export type UnipileWebhookHandlerMap = Partial<Record<string, UnipileWebhookHandler>>;
