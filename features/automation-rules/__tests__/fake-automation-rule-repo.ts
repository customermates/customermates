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

import { AutomationRuleRepo } from "../automation-rule.repo";

export class FakeAutomationRuleRepo extends AutomationRuleRepo {
  rules = new Map<string, StoredAutomationRule>();
  runs = new Map<string, StoredAutomationRuleRun>();
  candidates: AutomationDateCandidate[] = [];
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

  saveRule(data: AutomationRuleWrite) {
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
    return Promise.resolve(this.rules.delete(id));
  }

  countActiveRules(excludeId?: string) {
    return Promise.resolve([...this.rules.values()].filter((rule) => rule.enabled && rule.id !== excludeId).length);
  }

  findRuns(args: { ruleId: string; page: number; pageSize: number }) {
    const items = [...this.runs.values()].filter((run) => run.ruleId === args.ruleId);
    return Promise.resolve({ items, total: items.length });
  }

  findOccurrences(ruleId: string, keys: string[]) {
    return Promise.resolve(this.occurrences(ruleId, keys));
  }

  findDateCandidates() {
    return Promise.resolve({ items: this.candidates, total: this.candidates.length });
  }

  findEventRulesUnscoped(args: {
    companyId: string;
    triggerKinds: StoredAutomationRule["triggerKind"][];
    typeId: string | null;
    includeUntyped: boolean;
  }) {
    return Promise.resolve(
      [...this.rules.values()].filter(
        (rule) =>
          rule.companyId === args.companyId &&
          rule.enabled &&
          args.triggerKinds.includes(rule.triggerKind) &&
          ((args.typeId !== null && rule.typeId === args.typeId) || (args.includeUntyped && rule.typeId === null)),
      ),
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

  findStaleRunsUnscoped(queuedBefore: Date, runningBefore: Date, limit: number) {
    return Promise.resolve(
      [...this.runs.values()]
        .filter(
          (run) =>
            (run.status === "queued" && run.createdAt < queuedBefore) ||
            (run.status === "running" && run.startedAt !== null && run.startedAt < runningBefore),
        )
        .slice(0, limit)
        .map((run) => ({ id: run.id, companyId: run.companyId })),
    );
  }

  findDateRulesUnscoped(limit: number) {
    return Promise.resolve(
      [...this.rules.values()].filter((rule) => rule.enabled && rule.triggerKind === "dateReached").slice(0, limit),
    );
  }

  findDateCandidatesUnscoped() {
    return Promise.resolve(this.candidates);
  }

  findOccurrencesUnscoped(ruleId: string, keys: string[]) {
    return Promise.resolve(this.occurrences(ruleId, keys));
  }

  disableRuleUnscoped(companyId: string, ruleId: string, reason: string) {
    const rule = this.rules.get(ruleId);
    if (rule?.companyId === companyId) this.rules.set(ruleId, { ...rule, enabled: false, disabledReason: reason });
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
