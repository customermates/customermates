import type { CalculatedValue, RecordRef } from "./record-model.schema";
import type { RecordRepo, TrashReadOptions } from "./record.repo";

type StoredRow = Awaited<ReturnType<RecordRepo["getRecordCompanyWide"]>>;

export type CalculationReaderRepo = Pick<
  RecordRepo,
  "getRecordCompanyWide" | "getValueDependencies" | "linkedRecordsCompanyWide" | "setValue" | "setValueDependencies"
> &
  Partial<Pick<RecordRepo, "getRecordsCompanyWide" | "getValueDependenciesManyCompanyWide" | "linkedRecordsManyCompanyWide">>;

type Waiter<T> = { resolve: (value: T) => void; reject: (error: unknown) => void };
type LinkEntry = { refs: RecordRef[]; take: number | undefined };

const BULK_SIZE = 500;
const key = (ref: RecordRef) => `${ref.typeId}:${ref.recordId}`;

function chunks<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < items.length; offset += BULK_SIZE) result.push(items.slice(offset, offset + BULK_SIZE));
  return result;
}

export class CalculationReader implements CalculationReaderRepo {
  private rows = new Map<string, Promise<StoredRow>>();
  private dependencies = new Map<string, Promise<RecordRef[]>>();
  private links = new Map<string, Promise<LinkEntry>>();
  private pendingRows = new Map<string, { ref: RecordRef; waiters: Array<Waiter<StoredRow>> }>();
  private pendingDependencies = new Map<string, Map<string, { ref: RecordRef; waiters: Array<Waiter<RecordRef[]>> }>>();
  private pendingLinks = new Map<
    string,
    {
      relationId: string;
      direction: "outgoing" | "incoming";
      take: number | undefined;
      refs: Map<string, { ref: RecordRef; waiters: Array<Waiter<LinkEntry>> }>;
    }
  >();
  private scheduled = false;

  constructor(private readonly records: CalculationReaderRepo) {}

  getRecordCompanyWide(ref: RecordRef, options?: TrashReadOptions): Promise<StoredRow> {
    if (options && Object.keys(options).length) return this.records.getRecordCompanyWide(ref, options);
    const known = this.rows.get(key(ref));
    if (known) return known;
    const promise = new Promise<StoredRow>((resolve, reject) => {
      const pending = this.pendingRows.get(key(ref)) ?? { ref, waiters: [] };
      pending.waiters.push({ resolve, reject });
      this.pendingRows.set(key(ref), pending);
      this.schedule();
    });
    this.rows.set(key(ref), promise);
    return promise;
  }

  getValueDependencies(ref: RecordRef, fieldId: string): Promise<RecordRef[]> {
    const cacheKey = `${key(ref)}:${fieldId}`;
    const known = this.dependencies.get(cacheKey);
    if (known) return known;
    const promise = new Promise<RecordRef[]>((resolve, reject) => {
      const byField = this.pendingDependencies.get(fieldId) ?? new Map();
      const pending = byField.get(key(ref)) ?? { ref, waiters: [] };
      pending.waiters.push({ resolve, reject });
      byField.set(key(ref), pending);
      this.pendingDependencies.set(fieldId, byField);
      this.schedule();
    });
    this.dependencies.set(cacheKey, promise);
    return promise;
  }

  async linkedRecordsCompanyWide(
    ref: RecordRef,
    relationId: string,
    direction: "outgoing" | "incoming",
    take?: number,
  ): Promise<RecordRef[]> {
    const cacheKey = `${key(ref)}|${relationId}|${direction}`;
    const known = this.links.get(cacheKey);
    if (known) {
      const entry = await known;
      const complete = entry.take === undefined || entry.refs.length < entry.take;
      if (complete || (take !== undefined && take <= entry.refs.length))
        return take === undefined ? entry.refs : entry.refs.slice(0, take);
    }
    const promise = new Promise<LinkEntry>((resolve, reject) => {
      const group = `${relationId}|${direction}|${take ?? ""}`;
      const pending = this.pendingLinks.get(group) ?? { relationId, direction, take, refs: new Map() };
      const waiting = pending.refs.get(key(ref)) ?? { ref, waiters: [] };
      waiting.waiters.push({ resolve, reject });
      pending.refs.set(key(ref), waiting);
      this.pendingLinks.set(group, pending);
      this.schedule();
    });
    this.links.set(cacheKey, promise);
    return (await promise).refs;
  }

  async setValue(ref: RecordRef, fieldId: string, result: CalculatedValue, revision: number): Promise<void> {
    await this.records.setValue(ref, fieldId, result, revision);
    this.rows.delete(key(ref));
  }

  async setValueDependencies(ref: RecordRef, fieldId: string, sources: RecordRef[]): Promise<void> {
    await this.records.setValueDependencies(ref, fieldId, sources);
    this.dependencies.set(
      `${key(ref)}:${fieldId}`,
      Promise.resolve([...new Map(sources.map((source) => [key(source), source])).values()]),
    );
  }

  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    setImmediate(() => {
      this.scheduled = false;
      void this.flush();
    });
  }

  private async flush() {
    const rows = [...this.pendingRows.values()];
    this.pendingRows.clear();
    const dependencies = [...this.pendingDependencies.entries()];
    this.pendingDependencies.clear();
    const links = [...this.pendingLinks.values()];
    this.pendingLinks.clear();
    await Promise.all([
      this.settle(rows, (refs) => this.loadRows(refs)),
      ...dependencies.map(([fieldId, pending]) =>
        this.settle([...pending.values()], (refs) => this.loadDependencies(refs, fieldId)),
      ),
      ...links.map((group) =>
        this.settle([...group.refs.values()], async (refs) =>
          (await this.loadLinks(refs, group.relationId, group.direction, group.take)).map((linked) => ({
            refs: linked,
            take: group.take,
          })),
        ),
      ),
    ]);
  }

  private async settle<T>(
    pending: Array<{ ref: RecordRef; waiters: Array<Waiter<T>> }>,
    load: (refs: RecordRef[]) => Promise<T[]>,
  ) {
    for (const batch of chunks(pending)) {
      try {
        const values = await load(batch.map((entry) => entry.ref));
        batch.forEach((entry, index) => entry.waiters.forEach((waiter) => waiter.resolve(values[index])));
      } catch (error) {
        for (const entry of batch) for (const waiter of entry.waiters) waiter.reject(error);
      }
    }
  }

  private async loadRows(refs: RecordRef[]): Promise<StoredRow[]> {
    if (refs.length === 1 || !this.records.getRecordsCompanyWide)
      return Promise.all(refs.map((ref) => this.records.getRecordCompanyWide(ref)));
    const found = new Map(
      (await this.records.getRecordsCompanyWide(refs)).map((row) => [key({ typeId: row.typeId, recordId: row.id }), row]),
    );
    return refs.map((ref) => found.get(key(ref)) ?? null);
  }

  private async loadDependencies(refs: RecordRef[], fieldId: string): Promise<RecordRef[][]> {
    if (refs.length === 1 || !this.records.getValueDependenciesManyCompanyWide)
      return Promise.all(refs.map((ref) => this.records.getValueDependencies(ref, fieldId)));
    const found = new Map(
      (await this.records.getValueDependenciesManyCompanyWide(refs, [fieldId])).map((entry) => [
        key(entry.ref),
        entry.sources,
      ]),
    );
    return refs.map((ref) => found.get(key(ref)) ?? []);
  }

  private async loadLinks(
    refs: RecordRef[],
    relationId: string,
    direction: "outgoing" | "incoming",
    take: number | undefined,
  ): Promise<RecordRef[][]> {
    if (refs.length === 1 || !this.records.linkedRecordsManyCompanyWide)
      return Promise.all(refs.map((ref) => this.records.linkedRecordsCompanyWide(ref, relationId, direction, take)));
    const found = new Map(
      (await this.records.linkedRecordsManyCompanyWide(refs, relationId, direction, take)).map((entry) => [
        key(entry.ref),
        entry.linked,
      ]),
    );
    return refs.map((ref) => found.get(key(ref)) ?? []);
  }
}
