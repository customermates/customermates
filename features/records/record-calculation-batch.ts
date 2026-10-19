import type { CalculatedValue, RecordRef } from "./record-model.schema";
import type { RecordRepo, StoredDependencyWrite, StoredValueWrite, TrashReadOptions } from "./record.repo";

type StoredRow = Awaited<ReturnType<RecordRepo["getRecordCompanyWide"]>>;
type Direction = "outgoing" | "incoming";

/**
 * What a calculation reads and writes. The bulk methods are optional: a repository without them (the seed's buffered
 * repository, for instance) is read and written one record at a time.
 */
export type CalculationRecordRepo = Pick<
  RecordRepo,
  "getRecordCompanyWide" | "getValueDependencies" | "linkedRecordsCompanyWide" | "setValue" | "setValueDependencies"
> &
  Partial<
    Pick<
      RecordRepo,
      | "getRecordsCompanyWide"
      | "getValueDependenciesManyCompanyWide"
      | "linkedRecordsManyCompanyWide"
      | "setValues"
      | "setValueDependenciesMany"
    >
  >;

const CHUNK = 500;
const key = (ref: RecordRef) => `${ref.typeId}:${ref.recordId}`;

type Waiting<T> = { ref: RecordRef; resolve: (value: T) => void; reject: (error: unknown) => void };

/** Collects the records asked for until the next turn of the event loop and loads them in chunks of `CHUNK`. */
class Loader<T> {
  private waiting = new Map<string, Waiting<T>[]>();

  constructor(private readonly load: (refs: RecordRef[]) => Promise<T[]>) {}

  get size() {
    return this.waiting.size;
  }

  enqueue(ref: RecordRef): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.waiting.set(key(ref), [...(this.waiting.get(key(ref)) ?? []), { ref, resolve, reject }]);
    });
  }

  async run(): Promise<void> {
    const batch = [...this.waiting.values()];
    this.waiting.clear();
    for (let offset = 0; offset < batch.length; offset += CHUNK) {
      const chunk = batch.slice(offset, offset + CHUNK);
      try {
        const loaded = await this.load(chunk.map((waiters) => waiters[0].ref));
        chunk.forEach((waiters, index) => waiters.forEach((waiter) => waiter.resolve(loaded[index])));
      } catch (error) {
        for (const waiters of chunk) for (const waiter of waiters) waiter.reject(error);
      }
    }
  }
}

/**
 * One calculation run's view of the records. Reads that are asked for together, as the concurrent evaluation of many
 * records does, become one query per chunk of records; every read is cached for the run. Calculated values and their
 * dependencies are buffered and written in a few statements by `flush`, which the run calls once per field, after
 * which they are read back as written. A row read of a record with buffered values flushes first.
 */
export class CalculationBatch implements CalculationRecordRepo {
  private rows = new Map<string, Promise<StoredRow>>();
  private dependencies = new Map<string, Promise<RecordRef[]>>();
  private links = new Map<string, Promise<RecordRef[]>>();
  private rowLoader: Loader<StoredRow>;
  private dependencyLoaders = new Map<string, Loader<RecordRef[]>>();
  private linkLoaders = new Map<string, Loader<RecordRef[]>>();
  private scheduled = false;
  private values = new Map<string, StoredValueWrite>();
  private sources = new Map<string, StoredDependencyWrite>();
  private written = new Set<string>();

  constructor(private readonly records: CalculationRecordRepo) {
    this.rowLoader = new Loader(async (refs) => {
      if (refs.length === 1 || !records.getRecordsCompanyWide)
        return Promise.all(refs.map((ref) => records.getRecordCompanyWide(ref)));
      const found = new Map(
        (await records.getRecordsCompanyWide(refs)).map((row) => [key({ typeId: row.typeId, recordId: row.id }), row]),
      );
      return refs.map((ref) => found.get(key(ref)) ?? null);
    });
  }

  async getRecordCompanyWide(ref: RecordRef, options?: TrashReadOptions): Promise<StoredRow> {
    if (options?.includeTrash) return this.records.getRecordCompanyWide(ref, options);
    if (this.written.has(key(ref))) await this.flush();
    return this.cached(this.rows, key(ref), () => this.queue(this.rowLoader, ref));
  }

  getValueDependencies(ref: RecordRef, fieldId: string): Promise<RecordRef[]> {
    return this.cached(this.dependencies, `${key(ref)}:${fieldId}`, () => {
      let loader = this.dependencyLoaders.get(fieldId);
      if (!loader) {
        const records = this.records;
        loader = new Loader(async (refs) => {
          if (refs.length === 1 || !records.getValueDependenciesManyCompanyWide)
            return Promise.all(refs.map((owner) => records.getValueDependencies(owner, fieldId)));
          const found = new Map(
            (await records.getValueDependenciesManyCompanyWide(refs, [fieldId])).map((entry) => [
              key(entry.ref),
              entry.sources,
            ]),
          );
          return refs.map((owner) => found.get(key(owner)) ?? []);
        });
        this.dependencyLoaders.set(fieldId, loader);
      }
      return this.queue(loader, ref);
    });
  }

  linkedRecordsCompanyWide(ref: RecordRef, relationId: string, direction: Direction, take?: number) {
    const group = `${relationId}|${direction}|${take ?? ""}`;
    return this.cached(this.links, `${key(ref)}|${group}`, () => {
      let loader = this.linkLoaders.get(group);
      if (!loader) {
        const records = this.records;
        loader = new Loader(async (refs) => {
          if (refs.length === 1 || !records.linkedRecordsManyCompanyWide) {
            return Promise.all(
              refs.map((owner) => records.linkedRecordsCompanyWide(owner, relationId, direction, take)),
            );
          }
          const found = new Map(
            (await records.linkedRecordsManyCompanyWide(refs, relationId, direction, take)).map((entry) => [
              key(entry.ref),
              entry.linked,
            ]),
          );
          return refs.map((owner) => found.get(key(owner)) ?? []);
        });
        this.linkLoaders.set(group, loader);
      }
      return this.queue(loader, ref);
    });
  }

  setValue(ref: RecordRef, fieldId: string, result: CalculatedValue, revision: number): Promise<void> {
    const entry = `${key(ref)}:${fieldId}`;
    this.values.delete(entry);
    this.values.set(entry, { ref, fieldId, result, revision });
    this.written.add(key(ref));
    return Promise.resolve();
  }

  setValueDependencies(ref: RecordRef, fieldId: string, sources: RecordRef[]): Promise<void> {
    const entry = `${key(ref)}:${fieldId}`;
    const unique = [...new Map(sources.map((source) => [key(source), source])).values()];
    this.sources.delete(entry);
    this.sources.set(entry, { ref, fieldId, sources: unique });
    this.dependencies.set(entry, Promise.resolve(unique));
    return Promise.resolve();
  }

  /** Writes the buffered values, then their dependencies (a dependency belongs to its stored value). */
  async flush(): Promise<void> {
    const values = [...this.values.values()];
    const sources = [...this.sources.values()];
    const written = [...this.written];
    this.values.clear();
    this.sources.clear();
    this.written.clear();
    if (values.length) {
      if (this.records.setValues && values.length > 1) await this.records.setValues(values);
      else
        for (const value of values) await this.records.setValue(value.ref, value.fieldId, value.result, value.revision);
    }
    if (sources.length) {
      if (this.records.setValueDependenciesMany && sources.length > 1)
        await this.records.setValueDependenciesMany(sources);
      else
        for (const entry of sources) await this.records.setValueDependencies(entry.ref, entry.fieldId, entry.sources);
    }
    for (const ref of written) this.rows.delete(ref);
  }

  private cached<T>(cache: Map<string, Promise<T>>, entry: string, load: () => Promise<T>): Promise<T> {
    const known = cache.get(entry);
    if (known) return known;
    const loading = load();
    cache.set(entry, loading);
    loading.catch(() => {
      if (cache.get(entry) === loading) cache.delete(entry);
    });
    return loading;
  }

  private queue<T>(loader: Loader<T>, ref: RecordRef): Promise<T> {
    const loading = loader.enqueue(ref);
    if (!this.scheduled) {
      this.scheduled = true;
      setImmediate(() => {
        this.scheduled = false;
        void this.load();
      });
    }
    return loading;
  }

  private async load(): Promise<void> {
    const loaders = [this.rowLoader, ...this.dependencyLoaders.values(), ...this.linkLoaders.values()];
    await Promise.all(loaders.filter((loader) => loader.size).map((loader) => loader.run()));
  }
}
