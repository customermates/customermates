import { failureUnwindCause, unwindFailure } from "@/core/validation/failure-unwind";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordInvariant } from "./record-invariant";

import type { CalculationContext } from "./calculation";
import type {
  CalculatedValue,
  CalculationExpression,
  RecordField,
  RecordModel,
  RecordRef,
} from "./record-model.schema";
import type { RecordRepo } from "./record.repo";
import type { CalculationRecordRepo } from "./record-calculation-batch";

import { evaluateCalculation, fieldPrecisionResult, valueResult } from "./calculation";
import { scalarMatchesType, validateRecordModel } from "./record-model-validation";
import { decodeRecordValue } from "./record-storage";
import { CalculationBatch } from "./record-calculation-batch";

export type { CalculationRecordRepo } from "./record-calculation-batch";

export const SYNCHRONOUS_RECORD_LIMIT = 500;
export const recordKey = (ref: RecordRef) => `${ref.typeId}:${ref.recordId}`;

export function isCalculationBudgetExceeded(error: unknown): boolean {
  const cause = failureUnwindCause(error);
  return cause?.code === CustomErrorCode.recordCalculationBudget && cause.failureKind === "conflict";
}

type PathStep = { relationId: string; direction: "outgoing" | "incoming" };
type Source = { typeId: string; fieldId: string | null; path: PathStep[] };
type StoredRow = Awaited<ReturnType<RecordRepo["getRecordCompanyWide"]>>;
export type CalculationLinkChange = { relationId: string; source: RecordRef; target: RecordRef };
export type CalculationSeeds = { links?: CalculationLinkChange[]; unchanged?: ReadonlySet<string> };

/** The writes one calculated value needs; `changed` when its value or its dependencies differ from the stored ones. */
type StorePlan = {
  ref: RecordRef;
  fieldId: string;
  result: CalculatedValue;
  value: boolean;
  sources: RecordRef[] | null;
  changed: boolean;
};

/**
 * How a run reads, writes and orders its work. Batched, the records of one field are evaluated together, so their
 * reads are made together, and their writes are buffered and made in a few statements before the next field. One
 * record at a time, every record is evaluated and written before the next one is read, as before batching.
 */
type Run = {
  records: CalculationRecordRepo;
  each<T, R>(items: T[], compute: (item: T) => Promise<R>, apply: (result: R, item: T) => Promise<void>): Promise<void>;
  flush(): Promise<void>;
};

async function settled<T>(tasks: Array<Promise<T>>): Promise<T[]> {
  const results = await Promise.allSettled(tasks);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  return results.map((result) => (result as PromiseFulfilledResult<T>).value);
}

export function calculationSources(
  expression: CalculationExpression,
  typeId: string,
  model: RecordModel,
  path: PathStep[] = [],
): Source[] {
  if (expression.kind === "literal") return [];
  if (expression.kind === "field" || expression.kind === "optionAttribute")
    return [{ typeId, fieldId: expression.fieldId, path }];
  if (expression.kind === "operation")
    return expression.arguments.flatMap((argument) => calculationSources(argument, typeId, model, path));
  const relation = model.relationships.find((candidate) => candidate.id === expression.relationId);
  if (!relation) return [];
  const targetTypeId = expression.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
  const next = [...path, { relationId: relation.id, direction: expression.direction }];
  return [
    { typeId: targetTypeId, fieldId: null, path: next },
    ...calculationSources(expression.expression, targetTypeId, model, next),
  ];
}

function storedResult(definition: RecordField, evaluated: CalculatedValue): CalculatedValue {
  let result = evaluated;
  if (
    definition.valueType === "currency" &&
    result.state === "value" &&
    result.value.kind === "decimal" &&
    result.value.currency === null &&
    result.value.value === "0"
  ) {
    result = {
      state: "value",
      value: { ...result.value, currency: recordInvariant(definition.format?.currency) },
    };
  }
  result = fieldPrecisionResult(result, definition);
  if (result.state === "value" && !scalarMatchesType(result.value, definition.valueType, definition.multiple))
    result = { state: "error", code: "type_mismatch" };
  return result;
}

export class RecordCalculationService {
  /**
   * Batched runs are the product behaviour. The equivalence tests switch it off to compute the same changes one record
   * at a time, each record read and written on its own, and compare the stored results.
   */
  static batching = true;

  constructor(private records: CalculationRecordRepo) {}

  withRepository(records: CalculationRecordRepo): RecordCalculationService {
    return new RecordCalculationService(records);
  }

  private run(): Run {
    if (!RecordCalculationService.batching) {
      return {
        records: this.records,
        each: async (items, compute, apply) => {
          for (const item of items) await apply(await compute(item), item);
        },
        flush: () => Promise.resolve(),
      };
    }
    const batch = new CalculationBatch(this.records);
    return {
      records: batch,
      each: async (items, compute, apply) => {
        const results = await settled(items.map((item) => compute(item)));
        for (const [index, result] of results.entries()) await apply(result, items[index]);
      },
      flush: () => batch.flush(),
    };
  }

  async recalculate(
    model: RecordModel,
    seeds: RecordRef[],
    capture: Map<string, Set<string>> = new Map(),
    limit = SYNCHRONOUS_RECORD_LIMIT,
    changes: CalculationSeeds = {},
  ): Promise<{ complete: boolean; changed: RecordRef[] }> {
    try {
      const run = this.run();
      const result = await this.calculate(run, model, seeds, capture, limit, changes);
      await run.flush();
      return result;
    } catch (error) {
      if (isCalculationBudgetExceeded(error)) return { complete: false, changed: [] };
      throw error;
    }
  }

  private async calculate(
    run: Run,
    model: RecordModel,
    seeds: RecordRef[],
    capture: Map<string, Set<string>>,
    limit: number,
    { links = [], unchanged = new Set<string>() }: CalculationSeeds,
  ): Promise<{ complete: boolean; changed: RecordRef[] }> {
    const validation = validateRecordModel(model);
    if (validation.issues.length) throw new Error("Stored record model must satisfy calculation invariants");
    const fields = new Map(model.fields.map((field) => [field.id, field]));
    const own = new Map(
      [...seeds, ...links.flatMap((link) => [link.source, link.target])].map((ref) => [recordKey(ref), ref]),
    );
    const dirty = new Map(seeds.filter((ref) => !unchanged.has(recordKey(ref))).map((ref) => [recordKey(ref), ref]));
    const changed = new Map<string, RecordRef>();
    const { context, values, row } = this.context(run.records, model, limit);

    for (const fieldId of validation.calculationOrder) {
      const definition = recordInvariant(fields.get(fieldId));
      if (definition.behavior.kind === "input") continue;
      const expression = definition.behavior.expression;
      const targets = new Map([...own, ...dirty].filter(([, ref]) => ref.typeId === definition.typeId));
      const walks = new Map(
        calculationSources(expression, definition.typeId, model)
          .filter((source) => source.path.length)
          .map((source) => [JSON.stringify([source.typeId, source.path]), source] as const),
      );
      const reach = async (start: RecordRef[], path: PathStep[]) => {
        let frontier = start;
        for (const step of [...path].reverse()) {
          const next = new Map<string, RecordRef>();
          let exceeded = false;
          await run.each(
            frontier,
            (ref) =>
              exceeded
                ? Promise.resolve([])
                : context.related(ref, step.relationId, step.direction === "outgoing" ? "incoming" : "outgoing"),
            (parents) => {
              for (const parent of parents) next.set(recordKey(parent), parent);
              if (next.size > limit) exceeded = true;
              return Promise.resolve();
            },
          );
          if (exceeded) return null;
          frontier = [...next.values()];
        }
        return frontier;
      };
      for (const source of walks.values()) {
        const last = recordInvariant(source.path.at(-1));
        const crossed = links
          .filter((link) => link.relationId === last.relationId)
          .map((link) => (last.direction === "outgoing" ? link.source : link.target));
        for (const [start, path] of [
          [[...dirty.values()].filter((ref) => ref.typeId === source.typeId), source.path],
          [crossed, source.path.slice(0, -1)],
        ] as const) {
          if (!start.length) continue;
          const frontier = await reach(start, path);
          if (!frontier) return { complete: false, changed: [] };
          for (const target of frontier) targets.set(recordKey(target), target);
        }
      }
      if (new Set([...targets.keys(), ...changed.keys()]).size > limit) return { complete: false, changed: [] };
      await run.each(
        [...targets.values()],
        async (ref): Promise<StorePlan | null> => {
          const stored = await row(ref);
          if (!stored) return null;
          if (definition.behavior.kind === "snapshot" && !capture.get(recordKey(ref))?.has(fieldId)) return null;
          const result = storedResult(definition, await evaluateCalculation(expression, ref, context));
          const previous = await context.field(ref, fieldId);
          return this.plan(
            run.records,
            model,
            ref,
            fieldId,
            previous,
            result,
            stored.values.find((value) => value.fieldId === fieldId)?.schemaRevision,
            limit,
          );
        },
        async (plan, ref) => {
          if (!plan) return;
          await this.store(run.records, model, plan);
          if (!plan.changed) return;
          const key = recordKey(ref);
          values.set(`${key}:${fieldId}`, plan.result);
          dirty.set(key, ref);
          changed.set(key, ref);
        },
      );
      await run.flush();
    }
    return { complete: true, changed: [...changed.values()] };
  }

  async evaluate(
    model: RecordModel,
    ref: RecordRef,
    expression: CalculationExpression,
    limit = SYNCHRONOUS_RECORD_LIMIT,
  ): Promise<CalculatedValue | null> {
    try {
      return await evaluateCalculation(expression, ref, this.context(this.run().records, model, limit).context);
    } catch (error) {
      if (isCalculationBudgetExceeded(error)) return null;
      throw error;
    }
  }

  private context(records: CalculationRecordRepo, model: RecordModel, limit: number) {
    const fields = new Map(model.fields.map((field) => [field.id, field]));
    const values = new Map<string, CalculatedValue>();
    const rows = new Map<string, StoredRow>();
    const row = async (ref: RecordRef) => {
      const key = recordKey(ref);
      if (!rows.has(key)) rows.set(key, await records.getRecordCompanyWide(ref));
      return rows.get(key) ?? null;
    };
    const context: CalculationContext = {
      field: async (ref, fieldId) => {
        const key = `${recordKey(ref)}:${fieldId}`;
        if (values.has(key)) return recordInvariant(values.get(key));
        const definition = fields.get(fieldId);
        if (!definition || definition.typeId !== ref.typeId) return { state: "error", code: "dependency_error" };
        const stored = await row(ref);
        if (values.has(key)) return recordInvariant(values.get(key));
        const value = decodeRecordValue(
          stored?.values.find((candidate) => candidate.fieldId === fieldId),
          definition,
        );
        values.set(key, value);
        return value;
      },
      related: async (ref, relationId, direction) => {
        const refs = await records.linkedRecordsCompanyWide(ref, relationId, direction, limit + 1);
        if (refs.length > limit) throw unwindFailure(CustomErrorCode.recordCalculationBudget, "conflict");
        return refs;
      },
      optionAttribute: async (ref, fieldId, attribute) => {
        const value = await context.field(ref, fieldId);
        if (value.state !== "value") return value;
        if (value.value.kind !== "select") return { state: "error", code: "type_mismatch" };
        const selected = value.value.value;
        const option = fields.get(fieldId)?.options.find((candidate) => candidate.id === selected);
        return valueResult(option?.attributes.find((candidate) => candidate.key === attribute)?.value ?? null);
      },
    };
    return { context, values, row };
  }

  provenance(
    model: RecordModel,
    ref: RecordRef,
    expression: CalculationExpression,
    limit = SYNCHRONOUS_RECORD_LIMIT,
  ): Promise<RecordRef[]> {
    return this.trace(this.run().records, model, ref, expression, limit);
  }

  /** The records a value calculated by `expression` for `ref` reads, through relations and calculated fields. */
  private async trace(
    records: CalculationRecordRepo,
    model: RecordModel,
    ref: RecordRef,
    expression: CalculationExpression,
    limit: number,
  ): Promise<RecordRef[]> {
    const dependencies = new Map<string, RecordRef>();
    const add = (source: RecordRef) => {
      dependencies.set(recordKey(source), source);
      if (dependencies.size > limit) throw unwindFailure(CustomErrorCode.recordCalculationBudget, "conflict");
    };
    const visit = async (node: CalculationExpression, current: RecordRef): Promise<void> => {
      if (node.kind === "literal") return;
      if (node.kind === "operation") {
        await settled(node.arguments.map((argument) => visit(argument, current)));
        return;
      }
      if (node.kind === "related") {
        const related = await records.linkedRecordsCompanyWide(current, node.relationId, node.direction, limit + 1);
        if (related.length > limit) throw unwindFailure(CustomErrorCode.recordCalculationBudget, "conflict");
        for (const source of related) add(source);
        await settled(related.map((source) => visit(node.expression, source)));
        return;
      }
      const field = model.fields.find(
        (candidate) => candidate.id === node.fieldId && candidate.typeId === current.typeId,
      );
      if (!field || field.publishedSummary) return;
      for (const source of await records.getValueDependencies(current, field.id)) add(source);
      if (field.behavior.kind !== "input" && field.behavior.kind !== "snapshot")
        await visit(field.behavior.expression, current);
    };
    await visit(expression, ref);
    return [...dependencies.values()];
  }

  /** Compares a calculated value and its provenance with the stored ones and decides what to write. */
  private async plan(
    records: CalculationRecordRepo,
    model: RecordModel,
    ref: RecordRef,
    fieldId: string,
    previous: CalculatedValue,
    result: CalculatedValue,
    previousRevision: number | undefined,
    limit: number,
  ): Promise<StorePlan> {
    const field = recordInvariant(model.fields.find((candidate) => candidate.id === fieldId));
    if (field.behavior.kind === "input") throw new Error("Only calculated fields have calculation provenance");
    const [previousSources, sources] = await settled([
      records.getValueDependencies(ref, fieldId),
      this.trace(records, model, ref, field.behavior.expression, limit),
    ]);
    const keys = (refs: RecordRef[]) => refs.map(recordKey).sort();
    const dependenciesChanged = JSON.stringify(keys(previousSources)) !== JSON.stringify(keys(sources));
    const valueChanged = JSON.stringify(previous) !== JSON.stringify(result);
    return {
      ref,
      fieldId,
      result,
      value: valueChanged || previousRevision !== model.revision || field.behavior.kind === "snapshot",
      sources: dependenciesChanged ? sources : null,
      changed: valueChanged || dependenciesChanged,
    };
  }

  private async store(records: CalculationRecordRepo, model: RecordModel, plan: StorePlan): Promise<void> {
    if (plan.value) await records.setValue(plan.ref, plan.fieldId, plan.result, model.revision);
    if (plan.sources) await records.setValueDependencies(plan.ref, plan.fieldId, plan.sources);
  }

  async calculateField(model: RecordModel, ref: RecordRef, fieldId: string, limit: number): Promise<void> {
    await this.calculateFields(model, [ref], fieldId, limit);
  }

  /** Recalculates one calculated field of `refs` from what is stored, as a full recalculation of that field does. */
  async calculateFields(model: RecordModel, refs: RecordRef[], fieldId: string, limit: number): Promise<void> {
    const run = this.run();
    await run.each(
      refs,
      (ref) => this.calculateOne(run.records, model, ref, fieldId, limit),
      async (plan) => {
        if (plan) await this.store(run.records, model, plan);
      },
    );
    await run.flush();
  }

  private async calculateOne(
    records: CalculationRecordRepo,
    model: RecordModel,
    ref: RecordRef,
    fieldId: string,
    limit: number,
  ): Promise<StorePlan | null> {
    const definition = model.fields.find((field) => field.id === fieldId && field.typeId === ref.typeId);
    if (!definition || definition.behavior.kind === "input" || definition.archived) return null;
    const rows = new Map<string, Promise<StoredRow>>();
    const read = (source: RecordRef) => {
      const key = recordKey(source);
      if (!rows.has(key)) rows.set(key, records.getRecordCompanyWide(source));
      return recordInvariant(rows.get(key));
    };
    const owner = await read(ref);
    if (!owner) return null;
    const context: CalculationContext = {
      field: async (source, sourceFieldId) => {
        const field = model.fields.find(
          (candidate) => candidate.id === sourceFieldId && candidate.typeId === source.typeId,
        );
        if (!field) return { state: "error", code: "dependency_error" };
        const row = await read(source);
        return decodeRecordValue(
          row?.values.find((value) => value.fieldId === sourceFieldId),
          field,
        );
      },
      related: async (source, relationId, direction) => {
        const refs = await records.linkedRecordsCompanyWide(source, relationId, direction, limit + 1);
        if (refs.length > limit) throw unwindFailure(CustomErrorCode.recordCalculationBudget, "conflict");
        return refs;
      },
      optionAttribute: async (source, sourceFieldId, attribute) => {
        const value = await context.field(source, sourceFieldId);
        if (value.state !== "value") return value;
        if (value.value.kind !== "select") return { state: "error", code: "type_mismatch" };
        const selected = value.value.value;
        return valueResult(
          model.fields
            .find((field) => field.id === sourceFieldId)
            ?.options.find((option) => option.id === selected)
            ?.attributes.find((item) => item.key === attribute)?.value ?? null,
        );
      },
    };
    const result = storedResult(definition, await evaluateCalculation(definition.behavior.expression, ref, context));
    const previous = await context.field(ref, fieldId);
    return this.plan(
      records,
      model,
      ref,
      fieldId,
      previous,
      result,
      owner.values.find((value) => value.fieldId === fieldId)?.schemaRevision,
      limit,
    );
  }
}
