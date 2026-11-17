import { randomUUID } from "node:crypto";

import type {
  AutomationDateCandidate,
  AutomationOutboundWebhook,
  AutomationRuleWrite,
  AutomationRunAdmission,
  AutomationRunSettlement,
  StoredAutomationRule,
  StoredAutomationRuleRun,
} from "../automation-rule.repo";
import type { AutomationDateCandidateQuery, AutomationDateCandidateReader } from "../automation-ports";
import type { RuleRecordTrigger } from "../automation-record-trigger";
import type { AutomationRunCursor } from "../automation-run-cursor";

import { AutomationRuleRepo } from "../automation-rule.repo";

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

export class FakeAutomationRuleRepo extends AutomationRuleRepo {
  rules = new Map<string, StoredAutomationRule>();
  recordTriggers = new Map<string, RuleRecordTrigger>();
  runs = new Map<string, StoredAutomationRuleRun>();
  candidates: Array<Omit<AutomationDateCandidate, "kind"> & { kind?: AutomationDateCandidate["kind"] }> = [];
  unreadableRecords = new Set<string>();
  webhooks = new Map<string, AutomationOutboundWebhook>();
  accessibleAccounts = new Set<string>();
  companyId = "00000000-0000-4000-8000-000000000011";

  addRule(rule: Partial<StoredAutomationRule> & Pick<StoredAutomationRule, "id" | "trigger" | "effects">) {
    const stored: StoredAutomationRule = {
      companyId: this.companyId,
      ownerUserId: "00000000-0000-4000-8000-000000000010",
      name: "Rule",
      enabled: true,
      triggerKind: "recordCreated",
      typeId: null,
      conditions: [],
      disabledReason: null,
      lastRunAt: null,
      lastRunStatus: null,
      createdAt: new Date("2026-11-01T00:00:00.000Z"),
      updatedAt: new Date("2026-11-01T00:00:00.000Z"),
      owner: null,
      ...rule,
    };
    this.rules.set(stored.id, stored);
    return stored;
  }

  findRules(args: { typeId?: string; ownerUserId?: string; page: number; pageSize: number }) {
    const items = [...this.rules.values()].filter(
      (rule) =>
        (!args.typeId || rule.typeId === args.typeId) && (!args.ownerUserId || rule.ownerUserId === args.ownerUserId),
    );
    const start = (args.page - 1) * args.pageSize;
    return Promise.resolve({ items: items.slice(start, start + args.pageSize), total: items.length });
  }

  findRule(id: string) {
    return Promise.resolve(this.rules.get(id) ?? null);
  }

  saveRule(data: AutomationRuleWrite, recordTrigger: RuleRecordTrigger | null) {
    const previous = data.id ? this.rules.get(data.id) : undefined;
    const stored = this.addRule({
      ...previous,
      ...data,
      id: data.id ?? randomUUID(),
      trigger: data.trigger as StoredAutomationRule["trigger"],
      conditions: data.conditions as StoredAutomationRule["conditions"],
      effects: data.effects as StoredAutomationRule["effects"],
      disabledReason: data.enabled ? null : (previous?.disabledReason ?? null),
    });
    if (recordTrigger) this.recordTriggers.set(stored.id, recordTrigger);
    else this.recordTriggers.delete(stored.id);
    return Promise.resolve(stored);
  }

  setEnabled(id: string, enabled: boolean, disabledReason: string | null) {
    const rule = this.rules.get(id);
    if (!rule) return Promise.resolve(null);
    const updated = { ...rule, enabled, disabledReason: enabled ? null : disabledReason };
    this.rules.set(id, updated);
    return Promise.resolve(updated);
  }

  deleteRule(id: string) {
    this.recordTriggers.delete(id);
    return Promise.resolve(this.rules.delete(id));
  }

  countActiveRules(excludeId?: string) {
    return Promise.resolve([...this.rules.values()].filter((rule) => rule.enabled && rule.id !== excludeId).length);
  }

  findRuns(args: { ruleId: string; cursor: AutomationRunCursor | null; limit: number }) {
    const { cursor } = args;
    return Promise.resolve(
      [...this.runs.values()]
        .filter(
          (run) =>
            run.ruleId === args.ruleId &&
            (!cursor ||
              run.createdAt < cursor.createdAt ||
              (run.createdAt.getTime() === cursor.createdAt.getTime() && run.id < cursor.id)),
        )
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id))
        .slice(0, args.limit),
    );
  }

  countRunsSince(ruleIds: string[], since: Date) {
    const counts = new Map<string, number>();
    for (const run of this.runs.values()) {
      if (ruleIds.includes(run.ruleId) && run.createdAt >= since)
        counts.set(run.ruleId, (counts.get(run.ruleId) ?? 0) + 1);
    }
    return Promise.resolve(counts);
  }

  findEnabledRulesUnscoped(args: {
    companyId: string;
    ids?: string[];
    triggerKind?: StoredAutomationRule["triggerKind"];
  }) {
    return Promise.resolve(
      [...this.rules.values()].filter(
        (rule) =>
          rule.companyId === args.companyId &&
          rule.enabled &&
          (!args.ids || args.ids.includes(rule.id)) &&
          (!args.triggerKind || rule.triggerKind === args.triggerKind),
      ),
    );
  }

  getLabelsCompanyWide(companyId: string, ids: string[]) {
    return Promise.resolve(
      [...this.rules.values()]
        .filter((rule) => rule.companyId === companyId && ids.includes(rule.id))
        .map((rule) => ({ id: rule.id, name: rule.name })),
    );
  }

  admitRunUnscoped(admission: AutomationRunAdmission) {
    const duplicate = [...this.runs.values()].some(
      (run) => run.ruleId === admission.ruleId && run.occurrenceKey === admission.occurrenceKey,
    );
    if (duplicate) return Promise.resolve(null);
    const id = randomUUID();
    this.runs.set(id, {
      id,
      companyId: admission.companyId,
      ruleId: admission.ruleId,
      occurrenceKey: admission.occurrenceKey,
      status: "queued",
      triggerKind: admission.triggerKind,
      typeId: admission.typeId,
      recordId: admission.recordId,
      payload: admission.payload as StoredAutomationRuleRun["payload"],
      outcome: null,
      error: null,
      depth: admission.depth,
      scheduledFor: admission.scheduledFor,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date("2026-11-12T10:00:00.000Z"),
    });
    return Promise.resolve(id);
  }

  findRunUnscoped(companyId: string, runId: string) {
    const run = this.runs.get(runId);
    if (!run || run.companyId !== companyId) return Promise.resolve(null);
    return Promise.resolve({ run, rule: this.rules.get(run.ruleId) ?? null });
  }

  claimRunUnscoped(runId: string, companyId: string, now: Date, staleBefore: Date) {
    const run = this.runs.get(runId);
    if (!run || run.companyId !== companyId) return Promise.resolve(false);
    const stale = run.status === "running" && run.startedAt !== null && run.startedAt < staleBefore;
    if (run.status !== "queued" && !stale) return Promise.resolve(false);
    this.runs.set(runId, { ...run, status: "running", startedAt: now });
    return Promise.resolve(true);
  }

  saveRunProgressUnscoped(_companyId: string, runId: string, outcome: unknown) {
    const run = this.runs.get(runId);
    if (run?.status === "running")
      this.runs.set(runId, { ...run, outcome: structuredClone(outcome) as StoredAutomationRuleRun["outcome"] });
    return Promise.resolve();
  }

  settleRunUnscoped(settlement: AutomationRunSettlement) {
    const run = this.runs.get(settlement.runId);
    if (run?.status === "running") {
      this.runs.set(settlement.runId, {
        ...run,
        status: settlement.status,
        outcome: settlement.outcome as StoredAutomationRuleRun["outcome"],
        error: settlement.error,
        finishedAt: settlement.now,
      });
    }
    const rule = this.rules.get(settlement.ruleId);
    if (rule) this.rules.set(rule.id, { ...rule, lastRunAt: settlement.now, lastRunStatus: settlement.status });
    return Promise.resolve();
  }

  findStaleRunsUnscoped(queuedBefore: Date, runningBefore: Date, limits: { companies: number; perCompany: number }) {
    const oldestFirst = (left: StoredAutomationRuleRun, right: StoredAutomationRuleRun) =>
      left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id);
    const stale = [...this.runs.values()]
      .filter(
        (run) =>
          (run.status === "queued" && run.createdAt < queuedBefore) ||
          (run.status === "running" && run.startedAt !== null && run.startedAt < runningBefore),
      )
      .sort(oldestFirst);
    const companies = [...new Set(stale.map((run) => run.companyId))].slice(0, limits.companies);
    return Promise.resolve(
      companies.flatMap((companyId) =>
        stale
          .filter((run) => run.companyId === companyId)
          .slice(0, limits.perCompany)
          .map((run) => ({ id: run.id, companyId: run.companyId, createdAt: run.createdAt })),
      ),
    );
  }

  findDateRulesUnscoped(args: { afterId?: string; limit: number }) {
    return Promise.resolve(
      [...this.rules.values()]
        .filter(
          (rule) => rule.enabled && rule.triggerKind === "dateReached" && (!args.afterId || rule.id > args.afterId),
        )
        .sort((left, right) => left.id.localeCompare(right.id))
        .slice(0, args.limit),
    );
  }

  findDateCandidatesCompanyWide(args: { afterRecordId?: string; limit: number }) {
    return Promise.resolve(
      this.candidates
        .filter((candidate) => !args.afterRecordId || candidate.recordId > args.afterRecordId)
        .sort((left, right) => left.recordId.localeCompare(right.recordId))
        .slice(0, args.limit)
        .map((candidate): AutomationDateCandidate => ({ ...candidate, kind: candidate.kind ?? "date" })),
    );
  }

  findReadableRecordIdsUnscoped(args: { recordIds: string[] }) {
    return Promise.resolve(new Set(args.recordIds.filter((recordId) => !this.unreadableRecords.has(recordId))));
  }

  findOccurrencesCompanyWide(_companyId: string, ruleId: string, keys: string[]) {
    return Promise.resolve(this.occurrences(ruleId, keys));
  }

  deleteRunsBeforeUnscoped(before: Date, limit: number) {
    const expired = [...this.runs.values()]
      .filter((run) => run.createdAt < before && ["applied", "skipped", "failed"].includes(run.status))
      .slice(0, limit);
    for (const run of expired) this.runs.delete(run.id);
    return Promise.resolve(expired.length);
  }

  disableRuleUnscoped(companyId: string, ruleId: string, reason: string) {
    const rule = this.rules.get(ruleId);
    if (rule?.companyId === companyId && rule.enabled)
      this.rules.set(ruleId, { ...rule, enabled: false, disabledReason: reason });
    return Promise.resolve();
  }

  disableOwnerRulesUnscoped(companyId: string, ownerUserId: string, reason: string) {
    let count = 0;
    for (const rule of this.rules.values()) {
      if (rule.companyId !== companyId || rule.ownerUserId !== ownerUserId || !rule.enabled) continue;
      this.rules.set(rule.id, { ...rule, enabled: false, disabledReason: reason });
      count += 1;
    }
    return Promise.resolve(count);
  }

  syncRulesToPlanLimitCompanyWide(limit: number | null) {
    const oldestFirst = (left: StoredAutomationRule, right: StoredAutomationRule) =>
      left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id);
    const enabled = [...this.rules.values()].filter((rule) => rule.enabled).sort(oldestFirst);
    const kept = new Set(
      enabled
        .filter((rule) => rule.owner?.status === "active")
        .slice(0, limit ?? undefined)
        .map((rule) => rule.id),
    );
    const excess = limit === null ? [] : enabled.filter((rule) => !kept.has(rule.id));
    for (const rule of excess) this.rules.set(rule.id, { ...rule, enabled: false, disabledReason: "planPaused" });
    const room = limit === null ? Infinity : Math.max(0, limit - kept.size);
    const resumable = [...this.rules.values()]
      .filter((rule) => !rule.enabled && rule.disabledReason === "planPaused" && rule.owner?.status === "active")
      .sort(oldestFirst)
      .slice(0, room);
    for (const rule of resumable) this.rules.set(rule.id, { ...rule, enabled: true, disabledReason: null });
    return Promise.resolve({ paused: excess.length, resumed: resumable.length });
  }

  canUserAccessConnectedAccountUnscoped(_companyId: string, _userId: string, connectedAccountId: string) {
    return Promise.resolve(this.accessibleAccounts.has(connectedAccountId));
  }

  findOutboundWebhookUnscoped(_companyId: string, webhookId: string) {
    return Promise.resolve(this.webhooks.get(webhookId) ?? null);
  }

  private occurrences(ruleId: string, keys: string[]) {
    return new Set(
      [...this.runs.values()]
        .filter((run) => run.ruleId === ruleId && keys.includes(run.occurrenceKey))
        .map((run) => run.occurrenceKey),
    );
  }
}
