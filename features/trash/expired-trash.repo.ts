export abstract class ExpiredTrashRepo {
  abstract findExpiredTrashCompaniesUnscoped(now: Date, after: string | null, limit: number): Promise<string[]>;
}
