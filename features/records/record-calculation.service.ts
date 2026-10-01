import { recordInvariant } from "./record-invariant";

import type { CalculationContext } from "./calculation";
import type { CalculatedValue, CalculationExpression, RecordModel, RecordRef } from "./record-model.schema";
import type { RecordRepo } from "./record.repo";

import { evaluateCalculation, MISSING_VALUE, valueResult } from "./calculation";
import { scalarMatchesType, validateRecordModel } from "./record-model-validation";
import { decodeRecordValue } from "./record-storage";

export const SYNCHRONOUS_RECORD_LIMIT = 500;
export const recordKey = (ref: RecordRef) => `${ref.typeId}:${ref.recordId}`;

type PathStep = { relationId: string; direction: "outgoing" | "incoming" };
type Source = { typeId: string; fieldId: string; path: PathStep[] };
export type CalculationRecordRepo = Pick<
  RecordRepo,
  "getRecordCompanyWide" | "getValueDependencies" | "linkedRecordsCompanyWide" | "setValue" | "setValueDependencies"
>;
export class CalculationBudgetExceeded extends Error {}

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
  return calculationSources(
    expression.expression,
    expression.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId,
    model,
    [...path, { relationId: relation.id, direction: expression.direction }],
  );
}

export class RecordCalculationService {
  constructor(private records: CalculationRecordRepo) {}

  async recalculate(
    model: RecordModel,
    seeds: RecordRef[],
    currency: string,
    capture: Map<string, Set<string>> = new Map(),
    limit = SYNCHRONOUS_RECORD_LIMIT,
  ): Promise<{ complete: boolean; changed: RecordRef[] }> {
    try {
      return await this.calculate(model, seeds, currency, capture, limit);
    } catch (error) {
      if (error instanceof CalculationBudgetExceeded) return { complete: false, changed: [] };
      throw error;
    }
  }

  private async calculate(
    model: RecordModel,
    seeds: RecordRef[],
    currency: string,
    capture: Map<string, Set<string>>,
    limit: number,
  ): Promise<{ complete: boolean; changed: RecordRef[] }> {
    const validation = validateRecordModel(model);
    if (validation.issues.length) throw new Error("Stored record model must satisfy calculation invariants");
    const fields = new Map(model.fields.map((field) => [field.id, field]));
    const dirty = new Map(seeds.map((ref) => [recordKey(ref), ref]));
    const changed = new Map<string, RecordRef>();
    const values = new Map<string, CalculatedValue>();
    const rows = new Map<string, Awaited<ReturnType<RecordRepo["getRecordCompanyWide"]>>>();
    const row = async (ref: RecordRef) => {
      const key = recordKey(ref);
      if (!rows.has(key)) rows.set(key, await this.records.getRecordCompanyWide(ref));
      return rows.get(key) ?? null;
    };
    const context: CalculationContext = {
      field: async (ref, fieldId) => {
        const key = `${recordKey(ref)}:${fieldId}`;
        if (values.has(key)) return recordInvariant(values.get(key));
        const definition = fields.get(fieldId);
        if (!definition || definition.typeId !== ref.typeId) return { state: "error", code: "dependency_error" };
        const stored = await row(ref);
        const value = decodeRecordValue(
          stored?.values.find((candidate) => candidate.fieldId === fieldId),
          definition,
        );
        values.set(key, value);
        return value;
      },
      related: async (ref, relationId, direction) => {
        const refs = await this.records.linkedRecordsCompanyWide(ref, relationId, direction, limit + 1);
        if (refs.length > limit) throw new CalculationBudgetExceeded();
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

    for (const fieldId of validation.calculationOrder) {
      const definition = recordInvariant(fields.get(fieldId));
      if (definition.behavior.kind === "input") continue;
      const targets = new Map([...dirty].filter(([, ref]) => ref.typeId === definition.typeId));
      for (const source of calculationSources(definition.behavior.expression, definition.typeId, model)) {
        if (!source.path.length) continue;
        let frontier = [...dirty.values()].filter((ref) => ref.typeId === source.typeId);
        for (const step of [...source.path].reverse()) {
          const next = new Map<string, RecordRef>();
          for (const ref of frontier) {
            const parents = await context.related(
              ref,
              step.relationId,
              step.direction === "outgoing" ? "incoming" : "outgoing",
            );
            for (const parent of parents) next.set(recordKey(parent), parent);
            if (next.size > limit) return { complete: false, changed: [] };
          }
          frontier = [...next.values()];
        }
        for (const target of frontier) targets.set(recordKey(target), target);
      }
      if (new Set([...targets.keys(), ...changed.keys()]).size > limit) return { complete: false, changed: [] };
      for (const [key, ref] of targets) {
        const stored = await row(ref);
        if (!stored) continue;
        if (definition.behavior.kind === "snapshot" && !capture.get(key)?.has(fieldId)) continue;
        let result = await evaluateCalculation(definition.behavior.expression, ref, context);
        if (
          definition.valueType === "currency" &&
          result.state === "value" &&
          result.value.kind === "decimal" &&
          result.value.currency === null &&
          result.value.value === "0"
        ) {
          result = {
            state: "value",
            value: { ...result.value, currency: currency.toUpperCase() },
          };
        }
        if (result.state === "value" && !scalarMatchesType(result.value, definition.valueType, definition.multiple))
          result = { state: "error", code: "type_mismatch" };
        const previous = await context.field(ref, fieldId);
        const changedValue = await this.storeCalculation(
          model,
          ref,
          fieldId,
          previous,
          result,
          stored.values.find((value) => value.fieldId === fieldId)?.schemaRevision,
          limit,
        );
        if (!changedValue) continue;
        values.set(`${key}:${fieldId}`, result);
        dirty.set(key, ref);
        changed.set(key, ref);
      }
    }
    return { complete: true, changed: [...changed.values()] };
  }

  async provenance(
    model: RecordModel,
    ref: RecordRef,
    expression: CalculationExpression,
    limit = SYNCHRONOUS_RECORD_LIMIT,
  ): Promise<RecordRef[]> {
    const dependencies = new Map<string, RecordRef>();
    const add = (source: RecordRef) => {
      dependencies.set(recordKey(source), source);
      if (dependencies.size > limit) throw new CalculationBudgetExceeded();
    };
    const visit = async (node: CalculationExpression, current: RecordRef): Promise<void> => {
      if (node.kind === "literal") return;
      if (node.kind === "operation") {
        for (const argument of node.arguments) await visit(argument, current);
        return;
      }
      if (node.kind === "related") {
        const related = await this.records.linkedRecordsCompanyWide(
          current,
          node.relationId,
          node.direction,
          limit + 1,
        );
        if (related.length > limit) throw new CalculationBudgetExceeded();
        for (const source of related) {
          add(source);
          await visit(node.expression, source);
        }
        return;
      }
      const field = model.fields.find(
        (candidate) => candidate.id === node.fieldId && candidate.typeId === current.typeId,
      );
      if (!field || field.publishedSummary) return;
      for (const source of await this.records.getValueDependencies(current, field.id)) add(source);
      if (field.behavior.kind !== "input" && field.behavior.kind !== "snapshot")
        await visit(field.behavior.expression, current);
    };
    await visit(expression, ref);
    return [...dependencies.values()];
  }

  private async storeCalculation(
    model: RecordModel,
    ref: RecordRef,
    fieldId: string,
    previous: CalculatedValue,
    result: CalculatedValue,
    previousRevision: number | undefined,
    limit: number,
  ): Promise<boolean> {
    const field = recordInvariant(model.fields.find((candidate) => candidate.id === fieldId));
    if (field.behavior.kind === "input") throw new Error("Only calculated fields have calculation provenance");
    const previousSources = await this.records.getValueDependencies(ref, fieldId);
    const sources = await this.provenance(model, ref, field.behavior.expression, limit);
    const keys = (refs: RecordRef[]) => refs.map(recordKey).sort();
    const dependenciesChanged = JSON.stringify(keys(previousSources)) !== JSON.stringify(keys(sources));
    const valueChanged = JSON.stringify(previous) !== JSON.stringify(result);
    if (valueChanged || previousRevision !== model.revision || field.behavior.kind === "snapshot")
      await this.records.setValue(ref, fieldId, result, model.revision);
    if (dependenciesChanged) await this.records.setValueDependencies(ref, fieldId, sources);
    return valueChanged || dependenciesChanged;
  }

  async explain(
    model: RecordModel,
    ref: RecordRef,
    fieldId: string,
  ): Promise<{
    definition: RecordModel["fields"][number] | null;
    value: CalculatedValue;
  }> {
    const definition = model.fields.find((field) => field.id === fieldId && field.typeId === ref.typeId) ?? null;
    if (!definition) return { definition: null, value: MISSING_VALUE };
    const row = await this.records.getRecordCompanyWide(ref);
    return {
      definition,
      value: decodeRecordValue(
        row?.values.find((value) => value.fieldId === fieldId),
        definition,
      ),
    };
  }

  async calculateField(
    model: RecordModel,
    ref: RecordRef,
    fieldId: string,
    currency: string,
    limit: number,
  ): Promise<void> {
    const definition = model.fields.find((field) => field.id === fieldId && field.typeId === ref.typeId);
    if (!definition || definition.behavior.kind === "input" || definition.archived) return;
    const rows = new Map<string, Awaited<ReturnType<RecordRepo["getRecordCompanyWide"]>>>();
    const read = async (source: RecordRef) => {
      const key = recordKey(source);
      if (!rows.has(key)) rows.set(key, await this.records.getRecordCompanyWide(source));
      return rows.get(key) ?? null;
    };
    const owner = await read(ref);
    if (!owner) return;
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
        const refs = await this.records.linkedRecordsCompanyWide(source, relationId, direction, limit + 1);
        if (refs.length > limit) throw new CalculationBudgetExceeded();
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
    let result = await evaluateCalculation(definition.behavior.expression, ref, context);
    if (
      definition.valueType === "currency" &&
      result.state === "value" &&
      result.value.kind === "decimal" &&
      result.value.currency === null &&
      result.value.value === "0"
    ) {
      result = {
        state: "value",
        value: { ...result.value, currency: currency.toUpperCase() },
      };
    }
    if (result.state === "value" && !scalarMatchesType(result.value, definition.valueType, definition.multiple))
      result = { state: "error", code: "type_mismatch" };
    const previous = await context.field(ref, fieldId);
    await this.storeCalculation(
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
