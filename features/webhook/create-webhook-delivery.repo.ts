export abstract class CreateWebhookDeliveryRepo {
  abstract create(
    data: { webhookId?: string; url: string; event: string; requestBody: Record<string, unknown> }[],
  ): Promise<string[]>;
  abstract createUnscoped(
    companyId: string,
    data: { webhookId?: string; url: string; event: string; requestBody: Record<string, unknown> }[],
  ): Promise<string[]>;
}
