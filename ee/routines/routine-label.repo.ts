export abstract class RoutineLabelRepo {
  abstract getLabelsCompanyWide(companyId: string, ids: string[]): Promise<Array<{ id: string; name: string }>>;
}
