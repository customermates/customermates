export abstract class DispatchEmailPresenceSweepsRepo {
  abstract findAccountsForEmailPresenceSweepUnscoped(): Promise<{ id: string; companyId: string }[]>;
}
