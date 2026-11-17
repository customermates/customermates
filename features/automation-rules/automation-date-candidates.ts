import type { RecordRecipientRepo } from "@/features/records/record-recipient.repo";
import type { RecordRepo } from "@/features/records/record.repo";
import type { AutomationDateCandidateQuery, AutomationDateCandidateReader } from "./automation-ports";
import type { AutomationDateCandidate, AutomationRuleRepo } from "./automation-rule.repo";

import { runInTransaction } from "@/core/decorators/transaction-runner";
import { recordAccessForActor } from "@/features/records/record-access";
import { RecordQuerySchema } from "@/features/records/record-query.schema";
import { invalidRecordQueryPart } from "@/features/records/record-query-validation";

const SCAN_PAGE = 500;

export class ReadableDateCandidates implements AutomationDateCandidateReader {
  constructor(
    private readonly recordsForCompany: (companyId: string) => RecordRepo,
    private readonly recipients: Pick<RecordRecipientRepo, "findRecipientActorUnscoped">,
    private readonly rules: Pick<AutomationRuleRepo, "findDateCandidatesCompanyWide" | "findReadableRecordIdsUnscoped">,
    private readonly scanPage = SCAN_PAGE,
  ) {}

  readable(input: AutomationDateCandidateQuery): Promise<AutomationDateCandidate[]> {
    const { companyId, userId, typeId, fieldId } = input;
    return runInTransaction(
      async () => {
        const records = this.recordsForCompany(companyId);
        const [actor, model, grants] = await Promise.all([
          this.recipients.findRecipientActorUnscoped(companyId, userId),
          records.getModel(),
          records.getGrants(),
        ]);
        const policy = recordAccessForActor({ actor, model, grants, records, companyId, userId });
        if (!policy.actor) return [];
        const query = RecordQuerySchema.parse({
          typeId,
          filters: [{ fieldId, operator: "notEmpty", value: null }],
        });
        if (invalidRecordQueryPart(query, model)) return [];
        const access = policy.access(model.types.map((type) => type.id));
        const page = Math.max(input.limit, this.scanPage);
        const readable: AutomationDateCandidate[] = [];
        let afterRecordId = input.afterRecordId;
        for (;;) {
          const candidates = await this.rules.findDateCandidatesCompanyWide({
            companyId,
            typeId,
            fieldId,
            from: input.from,
            to: input.to,
            afterRecordId,
            limit: page,
          });
          const permitted = await this.rules.findReadableRecordIdsUnscoped({
            companyId,
            query,
            model,
            access,
            recordIds: candidates.map((candidate) => candidate.recordId),
          });
          for (const candidate of candidates) {
            if (!permitted.has(candidate.recordId)) continue;
            readable.push(candidate);
            if (readable.length === input.limit) return readable;
          }
          if (candidates.length < page) return readable;
          afterRecordId = candidates.at(-1)?.recordId;
        }
      },
      { companyId, readOnly: true },
    );
  }
}
