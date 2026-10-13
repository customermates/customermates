export abstract class RegisterUserRoleRepo {
  abstract createAdminRole(companyId: string): Promise<string>;
}
