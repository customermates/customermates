export abstract class AutomationRuleLabelRepo {
  abstract getLabelsCompanyWide(companyId: string, ids: string[]): Promise<Array<{ id: string; name: string }>>;
}
