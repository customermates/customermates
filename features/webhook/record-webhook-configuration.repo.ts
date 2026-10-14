export abstract class RecordWebhookConfigurationRepo {
  abstract getLabelsCompanyWide(
    companyId: string,
    ids: string[],
  ): Promise<Array<{ id: string; url: string; description: string | null }>>;
  abstract replaceRecordEventsCompanyWide(
    companyId: string,
    id: string,
    events: string[],
    pause: boolean,
  ): Promise<{ paused: boolean } | null>;
}
