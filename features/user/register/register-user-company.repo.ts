export abstract class RegisterUserCompanyRepo {
  abstract existsUnscoped(companyId: string): Promise<boolean>;
}
