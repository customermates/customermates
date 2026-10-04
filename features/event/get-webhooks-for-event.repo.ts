export abstract class GetWebhooksForEventRepo {
  abstract getWebhooksForEvent(event: string): Promise<{ id: string; url: string; events: string[] }[]>;
  abstract getWebhooksForEventUnscoped(
    event: string,
    companyId: string,
  ): Promise<{ id: string; url: string; events: string[] }[]>;
}
