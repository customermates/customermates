import type { LinkedinIdentityPlan, LinkedinIdentityRow } from "./linkedin-identity-consolidation";

export type LinkedinIdentityRepair = {
  merged: number;
  removed: number;
  keysAdded: number;
};

export abstract class RecordLinkedinIdentityRepo {
  abstract hasActiveOperationCompanyWide(): Promise<boolean>;
  abstract findLinkedinIdentitiesCompanyWide(): Promise<LinkedinIdentityRow[]>;
  abstract consolidateLinkedinIdentitiesCompanyWide(
    plan: Pick<LinkedinIdentityPlan, "merges" | "backfills">,
  ): Promise<LinkedinIdentityRepair>;
}
