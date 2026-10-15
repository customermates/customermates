import type { RecordPhoneIdentityRepo } from "./record-phone-identity.repo";

import { z } from "zod";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";

import { renormalizedPhoneIdentityValue } from "./phone-identity-value";

export const PHONE_IDENTITY_REPAIR_BATCH = 200;
const PHONE_IDENTITY_REPAIR_TIMEOUT_MS = 60_000;

const NormalizeCompanyPhoneIdentitiesSchema = z
  .object({ companyId: z.uuid(), after: z.string().min(1).max(200).nullable() })
  .strict();
type NormalizeCompanyPhoneIdentitiesData = z.infer<typeof NormalizeCompanyPhoneIdentitiesSchema>;

export type CompanyPhoneIdentityBatch = { renamed: number; merged: number; busy: boolean; next: string | null };

@SystemInteractor
export class NormalizeCompanyPhoneIdentitiesInteractor {
  constructor(private identities: (companyId: string) => RecordPhoneIdentityRepo) {}

  @Enforce(NormalizeCompanyPhoneIdentitiesSchema)
  async invoke(input: NormalizeCompanyPhoneIdentitiesData): Promise<CompanyPhoneIdentityBatch> {
    const identities = this.identities(input.companyId);
    return runInTransaction(
      async () => {
        if (await identities.hasActiveOperationCompanyWide()) return { renamed: 0, merged: 0, busy: true, next: null };
        const rows = await identities.findPhoneIdentityValuesCompanyWide(input.after, PHONE_IDENTITY_REPAIR_BATCH);
        const renames = rows.flatMap((row) => {
          const value = renormalizedPhoneIdentityValue(row.value);
          return value ? [{ id: row.id, value }] : [];
        });
        const repair = renames.length
          ? await identities.renamePhoneIdentitiesCompanyWide(renames)
          : { renamed: 0, merged: 0 };
        const last = rows.at(-1);
        return { ...repair, busy: false, next: rows.length === PHONE_IDENTITY_REPAIR_BATCH && last ? last.id : null };
      },
      { companyId: input.companyId, timeout: PHONE_IDENTITY_REPAIR_TIMEOUT_MS },
    );
  }
}
