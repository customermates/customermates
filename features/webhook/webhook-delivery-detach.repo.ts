export abstract class WebhookDeliveryDetachRepo {
  abstract detachWebhookDeliveries(companyId: string, webhookId: string): Promise<void>;
}
