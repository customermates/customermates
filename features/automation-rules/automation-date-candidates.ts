import type { RecordModel, RecordRef } from "@/features/records/record-model.schema";
import type { RecordAccessMap } from "@/features/records/record-query.schema";
import type { RecordRecipientRepo } from "@/features/records/record-recipient.repo";
import type { RecordRepo } from "@/features/records/record.repo";
import type {
  AutomationDateCandidateQuery,
  AutomationDateCandidateReader,
  AutomationRunRecordReader,
} from "./automation-ports";
import type { AutomationDateCandidate, AutomationRuleRepo } from "./automation-rule.repo";

import { runInTransaction } from "@/core/decorators/transaction-runner";
import { recordAccessForActor } from "@/features/records/record-access";
import { RecordQuerySchema } from "@/features/records/record-query.schema";
import { invalidRecordQueryPart } from "@/features/records/record-query-validation";

const SCAN_PAGE = 500;

type ActorAccess = { model: RecordModel; access: RecordAccessMap };

export class ReadableDateCandidates implements AutomationDateCandidateReader, AutomationRunRecordReader {
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
        const actor = await this.actorAccess(companyId, userId);
        if (!actor) return [];
        const { model, access } = actor;
        const query = RecordQuerySchema.parse({
          typeId,
          filters: [{ fieldId, operator: "notEmpty", value: null }],
        });
        if (invalidRecordQueryPart(query, model)) return [];
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

  readableRecordIds(input: { companyId: string; userId: string; refs: readonly RecordRef[] }): Promise<Set<string>> {
    const { companyId, userId } = input;
    const idsByType = new Map<string, Set<string>>();
    for (const ref of input.refs) {
      const ids = idsByType.get(ref.typeId) ?? new Set<string>();
      idsByType.set(ref.typeId, ids.add(ref.recordId));
    }
    if (idsByType.size === 0) return Promise.resolve(new Set());
    return runInTransaction(
      async () => {
        const readable = new Set<string>();
        const actor = await this.actorAccess(companyId, userId);
        if (!actor) return readable;
        const { model, access } = actor;
        for (const [typeId, ids] of idsByType) {
          const query = RecordQuerySchema.parse({ typeId });
          if (invalidRecordQueryPart(query, model)) continue;
          const permitted = await this.rules.findReadableRecordIdsUnscoped({
            companyId,
            query,
            model,
            access,
            recordIds: [...ids],
          });
          for (const id of permitted) readable.add(id);
        }
        return readable;
      },
      { companyId, readOnly: true },
    );
  }

  private async actorAccess(companyId: string, userId: string): Promise<ActorAccess | null> {
    const records = this.recordsForCompany(companyId);
    const [actor, model, grants] = await Promise.all([
      this.recipients.findRecipientActorUnscoped(companyId, userId),
      records.getModel(),
      records.getGrants(),
    ]);
    const policy = recordAccessForActor({ actor, model, grants, records, companyId, userId });
    if (!policy.actor) return null;
    return { model, access: policy.access(model.types.map((type) => type.id)) };
  }
}
