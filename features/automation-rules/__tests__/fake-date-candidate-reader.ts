import type { AutomationDateCandidate } from "../automation-rule.repo";
import type { AutomationDateCandidateQuery, AutomationDateCandidateReader } from "../automation-ports";
import type { FakeAutomationRuleRepo } from "./fake-automation-rule-repo";

export class FakeDateCandidateReader implements AutomationDateCandidateReader {
  readonly queries: AutomationDateCandidateQuery[] = [];

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
}
