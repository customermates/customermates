import type { CalculatedValue, RecordRef } from "./record-model.schema";
import { CalculationLoader } from "./record-calculation-loader";
import type { RecordRepo, StoredDependencyWrite, StoredValueWrite, TrashReadOptions } from "./record.repo";

type StoredRow = Awaited<ReturnType<RecordRepo["getRecordCompanyWide"]>>;
type Direction = "outgoing" | "incoming";

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

const key = (ref: RecordRef) => `${ref.typeId}:${ref.recordId}`;

export class CalculationBatch implements CalculationRecordRepo {
  private rows = new Map<string, Promise<StoredRow>>();
  private dependencies = new Map<string, Promise<RecordRef[]>>();
  private links = new Map<string, Promise<RecordRef[]>>();
  private rowLoader: CalculationLoader<StoredRow>;
  private dependencyLoaders = new Map<string, CalculationLoader<RecordRef[]>>();
  private linkLoaders = new Map<string, CalculationLoader<RecordRef[]>>();
  private scheduled = false;
  private values = new Map<string, StoredValueWrite>();
  private sources = new Map<string, StoredDependencyWrite>();
  private written = new Set<string>();

  constructor(private readonly records: CalculationRecordRepo) {
    this.rowLoader = new CalculationLoader(async (refs) => {
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
        loader = new CalculationLoader(async (refs) => {
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
        loader = new CalculationLoader(async (refs) => {
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

  private queue<T>(loader: CalculationLoader<T>, ref: RecordRef): Promise<T> {
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
