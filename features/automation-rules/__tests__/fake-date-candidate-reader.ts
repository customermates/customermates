import type { RecordRef } from "@/features/records/record-model.schema";
import type { AutomationDateCandidate } from "../automation-rule.repo";
import type {
  AutomationDateCandidateQuery,
  AutomationDateCandidateReader,
  AutomationRunRecordReader,
} from "../automation-ports";
import type { FakeAutomationRuleRepo } from "./fake-automation-rule-repo";

type ReadableRecordsInput = { companyId: string; userId: string; refs: readonly RecordRef[] };

export class FakeDateCandidateReader implements AutomationDateCandidateReader, AutomationRunRecordReader {
  readonly queries: AutomationDateCandidateQuery[] = [];
  readonly recordChecks: ReadableRecordsInput[] = [];

  constructor(private readonly repo: FakeAutomationRuleRepo) {}

  async readable(query: AutomationDateCandidateQuery): Promise<AutomationDateCandidate[]> {
    this.queries.push(query);
    const candidates = await this.repo.findDateCandidatesCompanyWide({
      afterRecordId: query.afterRecordId,
      limit: Number.MAX_SAFE_INTEGER,
    });
    const permitted = await this.repo.findReadableRecordIdsUnscoped({
      recordIds: candidates.map((candidate) => candidate.recordId),
    });
    return candidates.filter((candidate) => permitted.has(candidate.recordId)).slice(0, query.limit);
  }

  readableRecordIds(input: ReadableRecordsInput): Promise<Set<string>> {
    this.recordChecks.push(input);
    return this.repo.findReadableRecordIdsUnscoped({ recordIds: input.refs.map((ref) => ref.recordId) });
  }
}
