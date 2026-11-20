import type { StoredIncomingWebhook } from "./incoming-webhook.repo";

export type IncomingWebhookLookup = StoredIncomingWebhook & {
  companyId: string;
  company: { deletingAt: Date | null };
};

export abstract class IncomingWebhookLookupRepo {
  abstract findWebhookUnscoped(id: string): Promise<IncomingWebhookLookup | null>;
}
