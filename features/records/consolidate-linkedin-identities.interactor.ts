import type { RecordLinkedinIdentityRepo, LinkedinIdentityRepair } from "./record-linkedin-identity.repo";

import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";

import {
  planLinkedinIdentityConsolidation,
  type LinkedinIdentityPlan,
  type LinkedinIdentityRow,
} from "./linkedin-identity-consolidation";

const LINKEDIN_IDENTITY_REPAIR_TIMEOUT_MS = 120_000;

const ConsolidateLinkedinIdentitiesSchema = z
  .object({
    companyId: z.uuid(),
    apply: z.boolean(),
    excludeRecordIds: z.array(z.uuid()).max(1000).default([]),
  })
  .strict();
type ConsolidateLinkedinIdentitiesData = z.input<typeof ConsolidateLinkedinIdentitiesSchema>;

export type LinkedinIdentityBackup = {
  companyId: string;
  plan: LinkedinIdentityPlan;
  rows: LinkedinIdentityRow[];
};

export type LinkedinIdentityReadback = {
  remainingMerges: number;
  remainingBackfills: number;
  problems: string[];
};

export type LinkedinIdentityConsolidation = {
  busy: boolean;
  applied: boolean;
  plan: LinkedinIdentityPlan;
  repair: LinkedinIdentityRepair | null;
  readback: LinkedinIdentityReadback | null;
};

function readback(plan: LinkedinIdentityPlan, rows: LinkedinIdentityRow[], excludeRecordIds: Set<string>) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const problems: string[] = [];
  for (const merge of plan.merges) {
    const survivor = byId.get(merge.survivorId);
    if (!survivor) {
      problems.push(`${merge.survivorId}: survivor missing`);
      continue;
    }
    for (const id of merge.mergedIds) if (byId.has(id)) problems.push(`${id}: merged identity still exists`);
    const missingKeys = merge.keys.filter((key) => !survivor.keys.includes(key));
    if (missingKeys.length) problems.push(`${merge.survivorId}: missing keys ${missingKeys.join(", ")}`);
    const links = new Set(survivor.records.map((ref) => `${ref.typeId}:${ref.recordId}`));
    if (merge.records.some((ref) => !links.has(`${ref.typeId}:${ref.recordId}`)))
      problems.push(`${merge.survivorId}: lost a record link`);
    if (survivor.messagingId !== merge.messagingId) problems.push(`${merge.survivorId}: messagingId differs`);
  }
  for (const backfill of plan.backfills) {
    const row = byId.get(backfill.identityId);
    if (!row || backfill.keys.some((key) => !row.keys.includes(key)))
      problems.push(`${backfill.identityId}: backfilled keys missing`);
  }
  const after = planLinkedinIdentityConsolidation(rows, { excludeRecordIds });
  return {
    remainingMerges: after.merges.length,
    remainingBackfills: after.backfills.length,
    problems,
  };
}

/**
 * One-time, idempotent consolidation of one workspace's duplicate LinkedIn identities. A dry run
 * only plans. An apply hands the full affected rows to `backup` first (the transaction aborts if
 * it throws), applies the plan, reads every changed identity back and rolls back on any problem.
 */
@SystemInteractor
export class ConsolidateLinkedinIdentitiesInteractor {
  constructor(private identities: (companyId: string) => RecordLinkedinIdentityRepo) {}

  async invoke(
    data: ConsolidateLinkedinIdentitiesData,
    backup?: (snapshot: LinkedinIdentityBackup) => void | Promise<void>,
  ): Promise<LinkedinIdentityConsolidation> {
    const input = ConsolidateLinkedinIdentitiesSchema.parse(data);
    const identities = this.identities(input.companyId);
    const excludeRecordIds = new Set(input.excludeRecordIds);
    return runInTransaction(
      async () => {
        const rows = await identities.findLinkedinIdentitiesCompanyWide();
        const plan = planLinkedinIdentityConsolidation(rows, {
          excludeRecordIds,
        });
        const busy = await identities.hasActiveOperationCompanyWide();
        if (!input.apply || busy || (!plan.merges.length && !plan.backfills.length))
          return { busy, applied: false, plan, repair: null, readback: null };
        if (!backup) throw new Error("Applying the LinkedIn identity consolidation requires a backup");
        const touched = new Set([
          ...plan.merges.flatMap((merge) => [merge.survivorId, ...merge.mergedIds]),
          ...plan.backfills.map((backfill) => backfill.identityId),
        ]);
        await backup({
          companyId: input.companyId,
          plan,
          rows: rows.filter((row) => touched.has(row.id)),
        });
        const repair = await identities.consolidateLinkedinIdentitiesCompanyWide(plan);
        const checked = readback(plan, await identities.findLinkedinIdentitiesCompanyWide(), excludeRecordIds);
        if (checked.problems.length || checked.remainingMerges || checked.remainingBackfills)
          throw new Error(`LinkedIn identity readback failed, rolled back: ${JSON.stringify(checked)}`);

        return { busy, applied: true, plan, repair, readback: checked };
      },
      {
        companyId: input.companyId,
        timeout: LINKEDIN_IDENTITY_REPAIR_TIMEOUT_MS,
      },
    );
  }
}
