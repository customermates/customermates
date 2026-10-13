export abstract class RegisterUserCompanyRepo {
  abstract existsUnscoped(companyId: string): Promise<boolean>;
  abstract createRegisteredCompany(): Promise<string>;
  abstract recordSignupConversion(companyId: string, occurredAt: Date): Promise<void>;
}
