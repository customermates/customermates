import type { RecordRepo } from "./record.repo";
import type { RecordField, RecordModel, RecordRef } from "./record-model.schema";
import type { RecordEventPayload, RecordHistorySnapshot, RecordJournalEntry } from "./record-event.schema";

import { RecordJournalEntrySchema } from "./record-event.schema";
import { compareRecordKey } from "./record-json";
import { calculationDependencyHash } from "./configuration.service";
import { expressionFieldDependencies } from "./record-model-validation";
import { recordKey, SYNCHRONOUS_RECORD_LIMIT } from "./record-calculation.service";
import { CalculationBudgetExceeded } from "./calculation-budget-exceeded";
import { decodeRecordValue } from "./record-storage";
import { recordInvariant } from "./record-invariant";

export function historyPublications(field: RecordField, model: RecordModel) {
  const publications = new Map<string, { fieldId: string; dependencyHash: string }>();
  const visited = new Set<string>();
  const visit = (definition: RecordField) => {
    if (visited.has(definition.id)) return;
    visited.add(definition.id);
    if (definition.id !== field.id && definition.publishedSummary) {
      publications.set(definition.id, {
        fieldId: definition.id,
        dependencyHash: calculationDependencyHash(definition, model),
      });
      return;
    }
    if (definition.behavior.kind === "input") return;
    for (const id of expressionFieldDependencies(definition.behavior.expression)) {
      const dependency = model.fields.find((candidate) => candidate.id === id);
      if (dependency) visit(dependency);
    }
  };
  visit(field);
  return [...publications.values()].sort((a, b) => compareRecordKey(a.fieldId, b.fieldId));
}

async function snapshot(
  records: RecordRepo,
  ref: RecordRef,
  model: RecordModel,
): Promise<RecordHistorySnapshot | null> {
  const row = await records.getRecordCompanyWide(ref);
  if (!row) return null;
  const dependencies = new Map(
    (await records.getRecordDependenciesCompanyWide(ref)).map((entry) => [entry.fieldId, entry.sources]),
  );
  const identities = model.capabilities.some((binding) => binding.typeId === ref.typeId && binding.kind === "channels")
    ? await records.getIdentitiesCompanyWide(ref)
    : [];
  return {
    version: row.version,
    assignedUserIds: row.assignments.map((assignment) => assignment.userId).sort(),
    values: model.fields
      .filter((field) => field.typeId === ref.typeId && row.values.some((value) => value.fieldId === field.id))
      .sort((a, b) => compareRecordKey(a.id, b.id))
      .map((field) => ({
        fieldId: field.id,
        label: field.label,
        valueType: field.valueType,
        format: field.format,
        options: field.options,
        value: decodeRecordValue(
          row.values.find((value) => value.fieldId === field.id),
          field,
        ),
        sources: (dependencies.get(field.id) ?? []).sort((a, b) => compareRecordKey(recordKey(a), recordKey(b))),
        publications: historyPublications(field, model),
        dependencyHash: calculationDependencyHash(field, model),
        publishedSummary: field.publishedSummary,
      })),
    identities: identities
      .map(({ id, provider, value, messagingId, displayName, profileUrl }) => ({
        id,
        provider,
        value,
        messagingId,
        displayName,
        profileUrl,
      }))
      .sort((a, b) => compareRecordKey(a.id, b.id)),
  };
}

export function recordEventChanges(
  entry: RecordJournalEntry,
  after: RecordHistorySnapshot | null,
  model: RecordModel,
  cause: RecordEventPayload["cause"],
): {
  kind: "record.created" | "record.updated" | "record.deleted" | "record.restored";
  payload: RecordEventPayload;
} | null {
  const before = entry.before;
  if (!before && !after) return null;
  const previous = new Map(before?.values.map((field) => [field.fieldId, field]) ?? []);
  const current = new Map(after?.values.map((field) => [field.fieldId, field]) ?? []);
  const order = new Map(model.fields.map((field) => [field.id, field.position]));
  const fields = [...new Set([...previous.keys(), ...current.keys()])]
    .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0) || compareRecordKey(a, b))
    .map((fieldId) => ({ fieldId, before: previous.get(fieldId) ?? null, after: current.get(fieldId) ?? null }))
    .filter((change) => {
      if (
        (!change.before || change.before.value.state === "missing") &&
        (!change.after || change.after.value.state === "missing")
      )
        return false;
      return JSON.stringify(change.before) !== JSON.stringify(change.after);
    });
  const assignments = {
    before: before?.assignedUserIds ?? [],
    after: after?.assignedUserIds ?? [],
  };
  const identities = { before: before?.identities ?? [], after: after?.identities ?? [] };
  const links = entry.links.filter((link) => link.before !== link.after);
  const assignmentsChanged = JSON.stringify(assignments.before) !== JSON.stringify(assignments.after);
  const identitiesChanged = JSON.stringify(identities.before) !== JSON.stringify(identities.after);
  if (before && after && !fields.length && !links.length && !assignmentsChanged && !identitiesChanged) return null;
  return {
    kind: !before ? "record.created" : !after ? "record.deleted" : "record.updated",
    payload: {
      ref: entry.ref,
      schemaRevision: model.revision,
      cause,
      beforeVersion: before?.version ?? null,
      afterVersion: after?.version ?? null,
      changedFieldIds: fields.map((change) => change.fieldId),
      fields,
      assignments: assignmentsChanged ? assignments : null,
      identities: identitiesChanged ? identities : null,
      links,
    },
  };
}

export class RecordJournal {
  readonly repository: RecordRepo;
  private entries = new Map<string, RecordJournalEntry>();
  private emittedDeletions = new Set<string>();
  private restored = new Set<string>();
  private dirty = new Set<string>();

  constructor(
    private records: RecordRepo,
    private previous: RecordModel,
    private limit = SYNCHRONOUS_RECORD_LIMIT,
    private staging?: { base: RecordRepo; operationId: string },
  ) {
    const overrides: Partial<RecordRepo> = {
      create: async (ref, assignedUserIds) => {
        await this.capture(ref);
        await records.create(ref, assignedUserIds);
      },
      touch: async (ref) => {
        await this.capture(ref);
        await records.touch(ref);
      },
      setValue: async (ref, fieldId, result, revision) => {
        await this.capture(ref);
        await records.setValue(ref, fieldId, result, revision);
      },
      setValueDependencies: async (ref, fieldId, sources) => {
        await this.capture(ref);
        await records.setValueDependencies(ref, fieldId, sources);
      },
      setAssignments: async (ref, userIds) => {
        await this.capture(ref);
        await records.setAssignments(ref, userIds);
      },
      setIdentities: async (ref, identities) => {
        await this.capture(ref);
        await records.setIdentities(ref, identities);
      },
      link: async (relationId, source, target) => {
        await this.linkChange(relationId, source, target, true);
        await records.link(relationId, source, target);
      },
      unlink: async (relationId, source, target) => {
        await this.linkChange(relationId, source, target, false);
        await records.unlink(relationId, source, target);
      },
      delete: async (ref) => {
        await this.capture(ref);
        const links = await records.getLinksCompanyWide(ref, limit * 4 + 1);
        if (links.length > limit * 4) throw new CalculationBudgetExceeded();
        for (const link of links) await this.linkChange(link.relationId, link.source, link.target, false, true);
        await records.delete(ref);
      },
      moveToTrash: async (ref, trashItemId) => {
        await this.capture(ref);
        const links = await records.getLinksCompanyWide(ref, limit * 4 + 1);
        if (links.length > limit * 4) throw new CalculationBudgetExceeded();
        for (const link of links) await this.linkChange(link.relationId, link.source, link.target, false, true);
        await records.moveToTrash(ref, trashItemId);
      },
    };
    this.repository = new Proxy(records, {
      get(target, property) {
        const key = property as keyof RecordRepo;
        if (key in overrides) return overrides[key];
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  private markDirty(entry: RecordJournalEntry): void {
    if (this.staging) this.dirty.add(recordKey(entry.ref));
  }

  async persist(): Promise<void> {
    if (!this.staging) return;
    for (const key of this.dirty) {
      await this.staging.base.stageRow(
        this.staging.operationId,
        "journal",
        key,
        recordInvariant(this.entries.get(key)),
      );
    }
    this.dirty.clear();
  }

  async stageDeletion(ref: RecordRef, trashItemId: string): Promise<void> {
    if (!this.staging) throw new Error("A staged deletion requires a staged journal");
    await this.capture(ref);
    await this.records.moveToTrash(ref, trashItemId);
  }

  async prepareRestore(refs: RecordRef[]): Promise<void> {
    for (const ref of refs) {
      await this.capture(ref);
      this.restored.add(recordKey(ref));
    }
  }

  async restoreLink(link: { relationId: string; source: RecordRef; target: RecordRef }): Promise<void> {
    await this.linkChange(link.relationId, link.source, link.target, true, false);
  }

  async stageDeletedLink(link: { relationId: string; source: RecordRef; target: RecordRef }): Promise<void> {
    if (!this.staging) throw new Error("A staged deletion requires a staged journal");
    await this.linkChange(link.relationId, link.source, link.target, false, true);
  }

  private async capture(ref: RecordRef): Promise<RecordJournalEntry> {
    const key = recordKey(ref);
    const existing = this.entries.get(key);
    if (existing) return existing;
    if (this.entries.size >= this.limit) throw new CalculationBudgetExceeded();
    const saved = this.staging ? await this.staging.base.getStageRow(this.staging.operationId, "journal", key) : null;
    const entry = saved
      ? RecordJournalEntrySchema.parse(saved)
      : { ref, before: await snapshot(this.records, ref, this.previous), links: [] };
    this.entries.set(key, entry);
    if (!saved) this.markDirty(entry);
    return entry;
  }

  private async linkChange(
    relationId: string,
    source: RecordRef,
    target: RecordRef,
    after: boolean,
    existing?: boolean,
  ): Promise<void> {
    const before =
      existing ??
      (await this.records.linkedRecordsCompanyWide(source, relationId, "outgoing", this.limit * 4 + 1)).some(
        (ref) => recordKey(ref) === recordKey(target),
      );
    for (const ref of [source, target]) {
      const entry = await this.capture(ref);
      const found = entry.links.find(
        (link) =>
          link.relationId === relationId &&
          recordKey(link.source) === recordKey(source) &&
          recordKey(link.target) === recordKey(target),
      );
      if (found) found.after = after;
      else entry.links.push({ relationId, source, target, before, after });
      this.markDirty(entry);
    }
  }

  async prepareDeletion(
    refs: RecordRef[],
    model: RecordModel,
    actorId: string,
    causeId: string,
    cause: RecordEventPayload["cause"],
  ): Promise<void> {
    if (this.staging) throw new Error("Staged deletion matches are captured during publication");
    for (const ref of refs) await this.capture(ref);
    for (const ref of refs) {
      const links = await this.records.getLinksCompanyWide(ref, this.limit * 4 + 1);
      if (links.length > this.limit * 4) throw new CalculationBudgetExceeded();
      for (const link of links) await this.linkChange(link.relationId, link.source, link.target, false, true);
    }
    for (const ref of refs) {
      const entry = this.entries.get(recordKey(ref));
      if (!entry) throw new Error("A deletion requires its original record snapshot");
      const event = recordEventChanges(entry, null, model, cause);
      if (!event) continue;
      await this.records.appendEvent(ref, actorId, causeId, event.kind, event.payload, true);
      this.emittedDeletions.add(recordKey(ref));
    }
  }

  async flush(model: RecordModel, actorId: string, causeId: string, cause: RecordEventPayload["cause"]): Promise<void> {
    for (const entry of this.entries.values()) await this.emit(entry, model, actorId, causeId, cause);
  }

  async flushPage(
    model: RecordModel,
    actorId: string,
    causeId: string,
    cause: RecordEventPayload["cause"],
    afterKey: string | undefined,
    take: number,
  ): Promise<{ count: number; afterKey: string | undefined }> {
    if (!this.staging) throw new Error("A paginated journal requires a staged operation");
    const rows = await this.staging.base.getStageRowsPage(this.staging.operationId, "journal", afterKey, take);
    for (const row of rows)
      await this.emit(RecordJournalEntrySchema.parse(row.payload), model, actorId, causeId, cause);
    return { count: rows.length, afterKey: rows.at(-1)?.key };
  }

  private async emit(
    entry: RecordJournalEntry,
    model: RecordModel,
    actorId: string,
    causeId: string,
    cause: RecordEventPayload["cause"],
  ): Promise<void> {
    if (this.emittedDeletions.has(recordKey(entry.ref))) return;
    const after = await snapshot(this.records, entry.ref, model);
    const event = recordEventChanges(entry, after, model, cause);
    if (!event) return;
    if (event.kind === "record.created" && this.restored.has(recordKey(entry.ref))) event.kind = "record.restored";
    if (this.staging && entry.before && after && after.version <= entry.before.version)
      event.payload.afterVersion = entry.before.version + 1;
    await this.records.appendEvent(entry.ref, actorId, causeId, event.kind, event.payload);
  }
}
