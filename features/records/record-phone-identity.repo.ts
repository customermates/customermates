export type PhoneIdentityValue = { id: string; value: string };

export type PhoneIdentityRename = { id: string; value: string };

export type PhoneIdentityRepair = { renamed: number; merged: number };

export abstract class RecordPhoneIdentityRepo {
  abstract findPhoneIdentityCompaniesUnscoped(after: string | null, limit: number): Promise<string[]>;
  abstract findPhoneIdentityValuesCompanyWide(after: string | null, limit: number): Promise<PhoneIdentityValue[]>;
  abstract hasActiveOperationCompanyWide(): Promise<boolean>;
  abstract renamePhoneIdentitiesCompanyWide(renames: PhoneIdentityRename[]): Promise<PhoneIdentityRepair>;
}
