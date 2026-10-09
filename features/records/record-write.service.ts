import { recordChannelsEnabled } from "./record-channels";
import { recordInvariant } from "./record-invariant";

import { createHash, randomUUID } from "node:crypto";

import Decimal from "decimal.js";
import { z } from "zod";

import type { RecordAccessPolicy } from "./record-access";
import type { RecordRepo, StoredRecord } from "./record.repo";
import type { CalculatedValue, RecordModel, RecordRef, RecordScalar, RecordField } from "./record-model.schema";
import type { RecordMutation } from "./record-query.schema";
import type { InteractorFailureKind } from "@/core/validation/validation.utils";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { validateNotes } from "@/core/validation/validate-notes";
import { scalarMatchesType, selectedOptionIds } from "./record-model-validation";
import { valueResult } from "./calculation";
import { decodeRecordValue } from "./record-storage";
import { RecordCalculationService, recordKey, SYNCHRONOUS_RECORD_LIMIT } from "./record-calculation.service";
import type { RecordIdentityInput } from "./record-identity.schema";
import { identityKeys, normalizedIdentity, normalizedIdentityAssociation } from "./record-identity";
import { channelClass } from "@/ee/messaging/provider";
import { canonicalRecordJson } from "./record-json";

type Policy = Awaited<ReturnType<RecordAccessPolicy["load"]>>;
export { RecordWriteError } from "./record-write-error";
import { RecordWriteError } from "./record-write-error";
function reject(
  code: CustomErrorCode,
  kind: InteractorFailureKind = "validation",
  path: Array<string | number> = [],
): never {
  throw new RecordWriteError(code, kind, path);
}

export function normalizeRecordScalar(value: RecordScalar | null, field: RecordField): RecordScalar | null {
  if (!value) {
    if (field.required) reject(CustomErrorCode.recordValueInvalid);
    return null;
  }
  if (!scalarMatchesType(value, field.valueType, field.multiple)) reject(CustomErrorCode.recordValueInvalid);
  if (!selectedOptionIds(value).every((id) => field.options.some((option) => option.id === id)))
    reject(CustomErrorCode.recordValueInvalid);
  if (field.required && value.kind === "text" && !value.value.trim()) reject(CustomErrorCode.recordValueInvalid);
  if (value.kind === "richText") {
    const schema = z.string().transform((input, ctx) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(input);
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid document" });
        return null;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        ctx.addIssue({ code: "custom", message: "Invalid document" });
        return null;
      }
      return validateNotes(parsed, ctx, []);
    });
    const parsed = schema.safeParse(value.documentJson);
    if (!parsed.success) reject(CustomErrorCode.notesInvalidFormat);
    return { kind: "richText", documentJson: JSON.stringify(parsed.data) };
  }
  return value;
}

function comparableResult(result: CalculatedValue): unknown {
  if (result.state !== "value") return result;
  const value = result.value;
  if (value.kind === "decimal") return { ...value, value: new Decimal(value.value).toFixed() };
  if (value.kind === "richText") return { kind: value.kind, document: JSON.parse(value.documentJson) as unknown };
  return value;
}

export function sameRecordResult(left: CalculatedValue, right: CalculatedValue): boolean {
  return canonicalRecordJson(comparableResult(left)) === canonicalRecordJson(comparableResult(right));
}

export class RecordWriteService {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private calculations: RecordCalculationService,
  ) {}

  withRepository(records: RecordRepo): RecordWriteService {
    return new RecordWriteService(records, this.policy, new RecordCalculationService(records));
  }

  async planDeletion(
    mutation: Extract<RecordMutation, { action: "delete" | "deleteMany" }>,
    model: RecordModel,
    policy: Policy,
    limit = SYNCHRONOUS_RECORD_LIMIT,
  ) {
    await this.validateAccess(mutation, policy);
    const pending = mutation.action === "delete" ? [mutation.ref] : mutation.targets.map((target) => target.ref);
    const deleted = new Map<string, StoredRecord>();
    const affected = new Map<string, RecordRef>();
    const links = new Map<string, { relationId: string; source: RecordRef; target: RecordRef }>();
    const restrictions = new Set<string>();
    const add = (ref: RecordRef) => {
      affected.set(recordKey(ref), ref);
      if (affected.size > limit) reject(CustomErrorCode.recordCalculationBudget, "conflict");
    };
    while (pending.length) {
      const ref = recordInvariant(pending.pop());
      const key = recordKey(ref);
      if (deleted.has(key)) continue;
      if (!model.types.some((type) => type.id === ref.typeId && !type.archived))
        reject(CustomErrorCode.recordTypeNotFound, "not_found");
      const row = await this.records.getRecordCompanyWide(ref);
      if (!row || !(await policy.canRead(row))) reject(CustomErrorCode.recordNotFound, "not_found");
      if (!policy.allowed(ref.typeId, "delete")) reject(CustomErrorCode.permissionDenied, "authorization");
      if (row.protectedKind) reject(CustomErrorCode.recordProtected, "authorization");
      deleted.set(key, row);
      add(ref);
      for (const edge of await this.records.getLinksCompanyWide(ref, limit * 4 + 1)) {
        const edgeKey = `${edge.relationId}:${recordKey(edge.source)}:${recordKey(edge.target)}`;
        links.set(edgeKey, edge);
        if (links.size > limit * 4) reject(CustomErrorCode.recordCalculationBudget, "conflict");
        const relation = recordInvariant(model.relationships.find((relation) => relation.id === edge.relationId));
        const outgoing = recordKey(edge.source) === key;
        const opposite = outgoing ? edge.target : edge.source;
        const behavior = outgoing ? relation.onSourceDelete : relation.onTargetDelete;
        if (behavior === "cascade") pending.push(opposite);
        else if (behavior === "restrict") restrictions.add(recordKey(opposite));
        add(opposite);
      }
    }
    if ([...restrictions].some((key) => !deleted.has(key))) reject(CustomErrorCode.recordDependencies, "conflict");
    const impactHash = createHash("sha256")
      .update(
        JSON.stringify({
          revision: model.revision,
          records: [...deleted].map(([key, row]) => `${key}:${row.version}`).sort(),
          links: [...links.keys()].sort(),
        }),
      )
      .digest("hex");
    if (mutation.expectedImpactHash && mutation.expectedImpactHash !== impactHash)
      reject(CustomErrorCode.recordVersionChanged, "conflict");
    return { deleted, affected, links, impactHash };
  }

  async validateAccess(mutation: RecordMutation, policy: Policy): Promise<void> {
    if (!policy.actor) reject(CustomErrorCode.permissionDenied, "authorization");
    if (mutation.action === "updateMany" || mutation.action === "deleteMany") {
      for (const target of mutation.targets) {
        await this.validateAccess(
          mutation.action === "updateMany"
            ? {
                action: "update",
                ...target,
                fields: mutation.fields,
                assignedUserIds: mutation.assignedUserIds,
                linkChanges: mutation.linkChanges,
              }
            : { action: "delete", ...target },
          policy,
        );
      }
      return;
    }
    const ref =
      mutation.action === "create"
        ? null
        : mutation.action === "link" || mutation.action === "unlink"
          ? mutation.source
          : mutation.ref;
    const typeId = mutation.action === "create" ? mutation.typeId : recordInvariant(ref).typeId;
    if (
      !policy.allowed(
        typeId,
        mutation.action === "create" ? "create" : mutation.action === "delete" ? "delete" : "update",
      )
    )
      reject(CustomErrorCode.permissionDenied, "authorization");
    if (ref) {
      const row = await this.records.getRecordCompanyWide(ref);
      if (!row || !(await policy.canRead(row))) reject(CustomErrorCode.recordNotFound, "not_found");
      if (row.protectedKind) reject(CustomErrorCode.recordProtected, "authorization");
      if ((mutation.action === "update" || mutation.action === "delete") && row.version !== mutation.expectedVersion)
        reject(CustomErrorCode.recordVersionChanged, "conflict");
    }
    if (mutation.action === "link" || mutation.action === "unlink") {
      const row = await this.records.getRecordCompanyWide(mutation.target);
      if (!row || !(await policy.canRead(row))) reject(CustomErrorCode.recordNotFound, "not_found");
      if (row.protectedKind) reject(CustomErrorCode.recordProtected, "authorization");
    }
    if (mutation.action === "create" || mutation.action === "update") {
      const assignees = mutation.assignedUserIds;
      if (assignees && !(await this.policy.validAssignees(policy.actor, assignees, policy.canAssignOthers)))
        reject(CustomErrorCode.permissionDenied, "authorization");
      for (const field of mutation.fields) {
        if (
          field.value?.kind === "member" &&
          !(await this.policy.validAssignees(policy.actor, [field.value.value], policy.canAssignOthers))
        )
          reject(CustomErrorCode.permissionDenied, "authorization");
      }
    }
  }

  async apply(
    mutation: RecordMutation,
    model: RecordModel,
    policy: Policy,
    limit = SYNCHRONOUS_RECORD_LIMIT,
    options: {
      skipCalculations?: boolean;
      skipTouches?: boolean;
      createRecordId?: string;
      beforeDeletion?: (refs: RecordRef[]) => Promise<void>;
    } = {},
  ): Promise<{
    refs: RecordRef[];
    changedFieldIds: string[];
    captures: Array<{ ref: RecordRef; fieldIds: string[] }>;
  }> {
    if (!policy.actor) reject(CustomErrorCode.permissionDenied, "authorization");
    await this.validateAccess(mutation, policy);
    if (mutation.action === "updateMany") {
      const seeds = new Map<string, RecordRef>();
      const changedFields = new Set<string>();
      const captures = new Map<string, Set<string>>();
      for (const target of mutation.targets) {
        const result = await this.apply(
          {
            action: "update",
            ...target,
            fields: mutation.fields,
            assignedUserIds: mutation.assignedUserIds,
            linkChanges: mutation.linkChanges,
          },
          model,
          policy,
          limit,
          { skipCalculations: true, skipTouches: true },
        );
        for (const ref of result.refs) seeds.set(recordKey(ref), ref);
        for (const fieldId of result.changedFieldIds) changedFields.add(fieldId);
        for (const capture of result.captures) {
          const key = recordKey(capture.ref);
          const fields = captures.get(key) ?? new Set<string>();
          capture.fieldIds.forEach((id) => fields.add(id));
          captures.set(key, fields);
        }
        if (seeds.size > limit) reject(CustomErrorCode.recordCalculationBudget, "conflict");
      }
      if (!options.skipCalculations) {
        const result = await this.calculations.recalculate(model, [...seeds.values()], captures, limit);
        if (!result.complete) reject(CustomErrorCode.recordCalculationBudget, "conflict");
        for (const ref of result.changed) seeds.set(recordKey(ref), ref);
        if (seeds.size > limit) reject(CustomErrorCode.recordCalculationBudget, "conflict");
      }
      if (!options.skipTouches) for (const ref of seeds.values()) await this.records.touch(ref);
      return {
        refs: [...seeds.values()],
        changedFieldIds: [...changedFields],
        captures: [...captures].map(([key, fields]) => ({
          ref: recordInvariant(seeds.get(key)),
          fieldIds: [...fields],
        })),
      };
    }
    const fields = new Map(model.fields.filter((field) => !field.archived).map((field) => [field.id, field]));
    const seeds = new Map<string, RecordRef>();
    const changedFields = new Set<string>();
    const captures = new Map<string, Set<string>>();
    const deleted = new Set<string>();
    const fresh = new Set<string>();
    const assignIdentities = async (ref: RecordRef, inputs: RecordIdentityInput[] | undefined) => {
      if (!inputs) return;
      if (!recordChannelsEnabled(model, ref.typeId))
        reject(CustomErrorCode.recordProtected, "authorization", ["identities"]);

      const aliases = inputs.filter((input) => !normalizedIdentity(input));
      const known = aliases.length
        ? await this.records.getIdentityChannelsCompanyWide(
            aliases.flatMap((input) =>
              identityKeys(input).map((value) => ({ channelClass: channelClass(input.provider), value })),
            ),
          )
        : [];
      const normalized: RecordIdentityInput[] = [];
      for (const [index, input] of inputs.entries()) {
        const row = normalizedIdentityAssociation(input, known);
        if (!row) reject(CustomErrorCode.invalidChannelValue, "validation", ["identities", index, "value"]);
        normalized.push(row);
      }
      await this.records.setIdentities(ref, normalized);
    };
    const addSeed = (ref: RecordRef) => {
      seeds.set(recordKey(ref), ref);
      if (seeds.size > limit) reject(CustomErrorCode.recordCalculationBudget, "conflict");
    };
    const type = (id: string) => {
      const found = model.types.find((candidate) => candidate.id === id && !candidate.archived);
      if (!found) reject(CustomErrorCode.recordTypeNotFound, "not_found");
      return found;
    };
    const editable = async (ref: RecordRef, action: "update" | "delete" = "update"): Promise<StoredRecord> => {
      type(ref.typeId);
      const row = await this.records.getRecordCompanyWide(ref);
      if (!row || !(await policy.canRead(row))) reject(CustomErrorCode.recordNotFound, "not_found");
      if (!policy.allowed(ref.typeId, action)) reject(CustomErrorCode.permissionDenied, "authorization");
      if (row.protectedKind) reject(CustomErrorCode.recordProtected, "authorization");
      return row;
    };
    const link = async (relationId: string, source: RecordRef, target: RecordRef, remove = false) => {
      const relation = model.relationships.find((candidate) => candidate.id === relationId && !candidate.archived);
      if (!relation || relation.sourceTypeId !== source.typeId || relation.targetTypeId !== target.typeId)
        reject(CustomErrorCode.recordRelationConflict, "conflict");
      if (!fresh.has(recordKey(source))) await editable(source);
      const targetRow = await this.records.getRecordCompanyWide(target);
      if (!targetRow || (!fresh.has(recordKey(target)) && !(await policy.canRead(targetRow))))
        reject(CustomErrorCode.recordNotFound, "not_found");
      if (targetRow.protectedKind) reject(CustomErrorCode.recordProtected, "authorization");
      if (type(source.typeId).parentRelationshipId === relationId) {
        if (remove) reject(CustomErrorCode.recordRelationConflict, "conflict");
        await editable(target);
      }
      const existing = await this.records.linkedRecordsCompanyWide(source, relationId, "outgoing", limit + 1);
      const contains = existing.some((ref) => recordKey(ref) === recordKey(target));
      if (remove) {
        if (contains) await this.records.unlink(relationId, source, target);
      } else if (!contains) {
        if (relation.sourceCardinality === "one" && existing.length)
          reject(CustomErrorCode.recordRelationConflict, "conflict");
        if (
          relation.targetCardinality === "one" &&
          (await this.records.linkedRecordsCompanyWide(target, relationId, "incoming", 1)).length
        )
          reject(CustomErrorCode.recordRelationConflict, "conflict");
        await this.records.link(relationId, source, target);
      }
      addSeed(source);
      addSeed(target);
    };
    const assignFields = async (
      ref: RecordRef,
      assignments: Array<{ fieldId: string; value: RecordScalar | null }>,
      create: boolean,
      existing?: StoredRecord,
    ) => {
      if (new Set(assignments.map((assignment) => assignment.fieldId)).size !== assignments.length)
        reject(CustomErrorCode.recordValueInvalid, "validation", ["fields"]);
      const supplied = new Map(assignments.map((assignment) => [assignment.fieldId, assignment.value]));
      for (const [fieldId] of supplied) {
        const field = fields.get(fieldId);
        if (!field || field.typeId !== ref.typeId || field.valueType === "channels")
          reject(CustomErrorCode.recordValueInvalid, "validation", ["fields"]);
        if (
          field.behavior.kind !== "input" &&
          !(field.behavior.kind === "snapshot" && field.behavior.allowManualOverride)
        )
          reject(CustomErrorCode.recordReadOnlyField, "validation", ["fields"]);
      }
      for (const field of fields.values()) {
        if (field.typeId !== ref.typeId || field.valueType === "channels") continue;
        if (
          field.behavior.kind !== "input" &&
          !(field.behavior.kind === "snapshot" && field.behavior.allowManualOverride && supplied.has(field.id))
        )
          continue;
        if (!create && !supplied.has(field.id)) continue;
        const value = normalizeRecordScalar(
          supplied.has(field.id)
            ? (supplied.get(field.id) ?? null)
            : field.behavior.kind === "input"
              ? (field.behavior.defaultValue ?? null)
              : null,
          field,
        );
        if (
          value?.kind === "member" &&
          !(await this.policy.validAssignees(policy.actor, [value.value], policy.canAssignOthers))
        )
          reject(CustomErrorCode.permissionDenied, "authorization");
        const next = valueResult(value);
        if (
          existing &&
          sameRecordResult(
            decodeRecordValue(
              existing.values.find((stored) => stored.fieldId === field.id),
              field,
            ),
            next,
          )
        )
          continue;
        await this.records.setValue(ref, field.id, next, model.revision);
        await this.records.setValueDependencies(ref, field.id, []);
        changedFields.add(field.id);
      }
      const capture = new Set<string>();
      for (const field of fields.values()) {
        if (field.typeId !== ref.typeId || field.behavior.kind !== "snapshot" || supplied.has(field.id)) continue;
        if (create && field.behavior.capture === "create") capture.add(field.id);
        if (
          field.behavior.capture === "whenChanged" &&
          field.behavior.triggerFieldId &&
          supplied.has(field.behavior.triggerFieldId)
        ) {
          const triggerFieldId = field.behavior.triggerFieldId;
          const previous = existing
            ? decodeRecordValue(
                existing.values.find((value) => value.fieldId === triggerFieldId),
                recordInvariant(fields.get(triggerFieldId)),
              )
            : { state: "missing" };
          const next = supplied.get(triggerFieldId);
          if (
            JSON.stringify(next) === JSON.stringify(field.behavior.triggerValue) &&
            JSON.stringify(previous) !== JSON.stringify(valueResult(next ?? null))
          )
            capture.add(field.id);
        }
      }
      captures.set(recordKey(ref), capture);
    };

    if (mutation.action === "create") {
      const definition = type(mutation.typeId);
      if (
        definition.parentRelationshipId &&
        !(mutation.links ?? []).some(
          (link) => link.relationId === definition.parentRelationshipId && link.direction === "outgoing",
        )
      )
        reject(CustomErrorCode.recordRelationConflict, "conflict");
      if (definition.parentRelationshipId && mutation.assignedUserIds?.length)
        reject(CustomErrorCode.recordValueInvalid, "validation", ["assignedUserIds"]);

      if (!policy.allowed(mutation.typeId, "create")) reject(CustomErrorCode.permissionDenied, "authorization");
      const assignees = definition.parentRelationshipId ? [] : (mutation.assignedUserIds ?? [policy.actor.id]);
      if (!(await this.policy.validAssignees(policy.actor, assignees, policy.canAssignOthers)))
        reject(CustomErrorCode.permissionDenied, "authorization");
      const ref = {
        typeId: mutation.typeId,
        recordId: options.createRecordId ?? randomUUID(),
      };
      await this.records.create(ref, assignees);
      fresh.add(recordKey(ref));
      addSeed(ref);
      await assignFields(ref, mutation.fields, true);
      await assignIdentities(ref, mutation.identities);
      for (const relation of mutation.links ?? []) {
        await link(
          relation.relationId,
          relation.direction === "outgoing" ? ref : relation.record,
          relation.direction === "outgoing" ? relation.record : ref,
        );
      }
    } else if (mutation.action === "update") {
      const row = await editable(mutation.ref);
      if (row.version !== mutation.expectedVersion) reject(CustomErrorCode.recordVersionChanged, "conflict");
      if (mutation.assignedUserIds && type(mutation.ref.typeId).parentRelationshipId) {
        if (mutation.assignedUserIds.length)
          reject(CustomErrorCode.recordValueInvalid, "validation", ["assignedUserIds"]);
      } else if (mutation.assignedUserIds) {
        if (!(await this.policy.validAssignees(policy.actor, mutation.assignedUserIds, policy.canAssignOthers)))
          reject(CustomErrorCode.permissionDenied, "authorization");
        await this.records.setAssignments(mutation.ref, mutation.assignedUserIds);
      }
      await assignFields(mutation.ref, mutation.fields, false, row);
      await assignIdentities(mutation.ref, mutation.identities);
      for (const change of mutation.linkChanges ?? []) {
        await link(
          change.relationId,
          change.direction === "outgoing" ? mutation.ref : change.record,
          change.direction === "outgoing" ? change.record : mutation.ref,
          change.action === "unlink",
        );
      }
      for (const fieldId of mutation.captureFieldIds ?? []) {
        const field = fields.get(fieldId);
        if (
          !field ||
          field.typeId !== mutation.ref.typeId ||
          field.behavior.kind !== "snapshot" ||
          mutation.fields.some((assignment) => assignment.fieldId === fieldId)
        )
          reject(CustomErrorCode.recordValueInvalid);
        recordInvariant(captures.get(recordKey(mutation.ref))).add(fieldId);
      }
      addSeed(mutation.ref);
    } else if (mutation.action === "delete" || mutation.action === "deleteMany") {
      const plan = await this.planDeletion(mutation, model, policy, limit);
      for (const key of plan.deleted.keys()) deleted.add(key);
      for (const ref of plan.affected.values()) addSeed(ref);
      await options.beforeDeletion?.(
        [...plan.deleted.values()].map((row) => ({
          typeId: row.typeId,
          recordId: row.id,
        })),
      );
      for (const key of deleted) await this.records.delete(recordInvariant(seeds.get(key)));
    } else await link(mutation.relationId, mutation.source, mutation.target, mutation.action === "unlink");

    const recalculated = options.skipCalculations
      ? { complete: true, changed: [] }
      : await this.calculations.recalculate(model, [...seeds.values()], captures, limit);
    if (!recalculated.complete) reject(CustomErrorCode.recordCalculationBudget, "conflict");
    for (const ref of recalculated.changed) addSeed(ref);
    if (!options.skipTouches)
      for (const [key, ref] of seeds) if (!deleted.has(key) && !fresh.has(key)) await this.records.touch(ref);

    return {
      refs: [...seeds.values()],
      changedFieldIds: [...changedFields],
      captures: [...captures].map(([key, fieldIds]) => ({
        ref: recordInvariant(seeds.get(key)),
        fieldIds: [...fieldIds],
      })),
    };
  }
}
