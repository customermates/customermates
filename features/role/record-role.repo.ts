export abstract class RecordRoleRepo {
  abstract countRolesCompanyWide(companyId: string, roleIds: string[]): Promise<number>;
}
