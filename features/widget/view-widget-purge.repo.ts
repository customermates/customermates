export abstract class ViewWidgetPurgeRepo {
  abstract purgeOnTrashedViewsCompanyWide(companyId: string, viewIds: string[]): Promise<void>;
}
