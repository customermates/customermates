export abstract class CreateWebhookDeliveryRepo {
  abstract create(data: { url: string; event: string; requestBody: Record<string, unknown> }[]): Promise<string[]>;
  abstract createUnscoped(
    companyId: string,
    data: { url: string; event: string; requestBody: Record<string, unknown> }[],
  ): Promise<string[]>;
}
