import type { RecordRepo } from "./record.repo";

import { recordAccessForActor } from "./record-access";
import { RECORD_SYSTEM_ACTOR } from "./record-system-actor";

export async function systemRecordAccess(records: RecordRepo, companyId: string) {
  const [model, grants] = await Promise.all([records.getModel(), records.getGrants()]);
  return recordAccessForActor({
    actor: {
      id: RECORD_SYSTEM_ACTOR,
      status: "active",
      role: { id: RECORD_SYSTEM_ACTOR, companyId, isSystemRole: true, permissions: [] },
    },
    grants,
    model,
    records,
    companyId,
    userId: RECORD_SYSTEM_ACTOR,
  });
}
