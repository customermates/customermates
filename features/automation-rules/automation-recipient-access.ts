import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordRecipientRepo } from "@/features/records/record-recipient.repo";
import type { RecordRepo } from "@/features/records/record.repo";
import type { AutomationRecipientAccess, AutomationRecipientAccessPort } from "./automation-ports";

import { runInTransaction } from "@/core/decorators/transaction-runner";
import { recordAccessForActor } from "@/features/records/record-access";
import { RecordQuerySchema } from "@/features/records/record-query.schema";

export class RecordRecipientAccess implements AutomationRecipientAccessPort {
  constructor(
    private readonly recordsForCompany: (companyId: string) => RecordRepo,
    private readonly recipients: Pick<RecordRecipientRepo, "findRecipientActorUnscoped" | "matchesRecordQueryUnscoped">,
  ) {}

  recordAccess(input: {
    companyId: string;
    ref: RecordRef;
    userIds: readonly string[];
  }): Promise<Map<string, AutomationRecipientAccess>> {
    const { companyId, ref } = input;
    return runInTransaction(
      async () => {
        const records = this.recordsForCompany(companyId);
        const [model, grants] = await Promise.all([records.getModel(), records.getGrants()]);
        const typeIds = model.types.map((type) => type.id);
        const primaryFieldId = model.types.find((type) => type.id === ref.typeId)?.primaryFieldId ?? null;
        const readable = RecordQuerySchema.parse({ typeId: ref.typeId });
        const named = primaryFieldId
          ? RecordQuerySchema.parse({
              typeId: ref.typeId,
              filters: [{ fieldId: primaryFieldId, operator: "notEmpty", value: null }],
            })
          : null;
        const result = new Map<string, AutomationRecipientAccess>();
        for (const userId of new Set(input.userIds)) {
          const actor = await this.recipients.findRecipientActorUnscoped(companyId, userId);
          const policy = recordAccessForActor({ actor, model, grants, records, companyId, userId });
          const access = policy.access(typeIds);
          const matches = (query: typeof readable) =>
            this.recipients.matchesRecordQueryUnscoped({ companyId, query, model, access, subjectId: ref.recordId });
          if (named && (await matches(named))) result.set(userId, "name");
          else result.set(userId, (await matches(readable)) ? "record" : "none");
        }
        return result;
      },
      { companyId, readOnly: true },
    );
  }
}
