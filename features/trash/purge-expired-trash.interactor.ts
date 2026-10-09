import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export const TRASH_PURGE_COMPANY_LIMIT = 50;
export const TRASH_PURGE_BATCH_SIZE = 100;
export const TRASH_PURGE_PASSES = 5;

export abstract class ExpiredTrashRepo {
  abstract findExpiredTrashCompaniesUnscoped(
    now: Date,
    limit: number,
  ): Promise<Array<{ companyId: string; administratorId: string | null }>>;
}

export type PurgeCompanyTrash = (companyId: string, administratorId: string, now: Date, take: number) => Promise<number>;

@SystemInteractor
export class PurgeExpiredTrashInteractor {
  constructor(
    private repo: ExpiredTrashRepo,
    private purgeCompany: PurgeCompanyTrash,
  ) {}

  async invoke(args: { now?: Date } = {}): Promise<{ purged: number; skippedCompanies: string[] }> {
    const now = args.now ?? new Date();
    const companies = await this.repo.findExpiredTrashCompaniesUnscoped(now, TRASH_PURGE_COMPANY_LIMIT);
    let purged = 0;
    const skippedCompanies: string[] = [];
    for (const { companyId, administratorId } of companies) {
      if (!administratorId) {
        skippedCompanies.push(companyId);
        continue;
      }
      for (let pass = 0; pass < TRASH_PURGE_PASSES; pass++) {
        const count = await this.purgeCompany(companyId, administratorId, now, TRASH_PURGE_BATCH_SIZE);
        purged += count;
        if (count < TRASH_PURGE_BATCH_SIZE) break;
      }
    }
    if (skippedCompanies.length)
      console.warn("Trash retention skipped companies without an active administrator", skippedCompanies);
    return { purged, skippedCompanies };
  }
}
