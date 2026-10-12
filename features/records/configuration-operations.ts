import type { Action, RecordTypeGrant } from "@/generated/prisma";

import { unwindFailure } from "@/core/validation/failure-unwind";
import { CustomErrorCode } from "@/core/validation/validation.types";

import type { ConfigurationChange } from "./configuration.schema";
import type { ConfigurationReferences } from "./configuration-references";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordField, RecordModel } from "./record-model.schema";

import { deterministicId } from "./crm-preset";

export type ConfigurationGrants = Array<{
  typeId: string;
  grants: Array<{ roleId: string; actions: Action[] }>;
}>;

type ConfigurationContext = {
  companyId: () => string;
  policy: Awaited<ReturnType<RecordAccessPolicy["load"]>>;
  references: ConfigurationReferences;
  previousGrants: RecordTypeGrant[];
  validRoles: (roleIds: string[]) => Promise<boolean>;
};

function upsert<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) items.push(item);
  else items[index] = item;
}

export async function applyConfigurationOperations(
  model: RecordModel,
  current: RecordModel,
  input: ConfigurationChange,
  { companyId, policy, references, previousGrants, validRoles }: ConfigurationContext,
): Promise<{ grants: ConfigurationGrants; reorderedTypes: Set<string> }> {
  const { resolve, resolveDefinition } = references;
  const reorderedTypes = new Set<string>();
  const grants: ConfigurationGrants = [];
  for (const operation of input.operations) {
    if (operation.operation === "putAccessPreset") {
      if (!policy.canManageRoles) throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
      if (!(await validRoles(operation.preset.grants.map((grant) => grant.roleId))))
        throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
      upsert(model.accessPresets, { ...operation.preset, id: resolve(operation.preset.id) });
    }
  }
  for (const operation of input.operations) {
    if (operation.operation === "createType") {
      const id = resolve(operation.reference);
      if (model.types.some((type) => type.id === id)) throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
      const nameId =
        references.references.get(`${operation.reference}.name`) ??
        deterministicId(companyId(), `configuration:${input.idempotencyKey}:${id}:name`);
      model.types.push({
        id,
        label: operation.label,
        pluralLabel: operation.pluralLabel,
        description: operation.description,
        icon: operation.icon,
        embedded: operation.embedded,
        navigationVisible: operation.navigationVisible ?? !operation.embedded,
        archived: false,
        position: Math.max(-1, ...model.types.map((type) => type.position)) + 1,
        primaryFieldId: nameId,
        parentRelationshipId: null,
      });
      model.fields.push({
        id: nameId,
        typeId: id,
        label: operation.label,
        valueType: "text",
        required: true,
        behavior: { kind: "input" },
        archived: false,
        publishedSummary: false,
        options: [],
        position: 0,
      });
      if (operation.accessPresetId) {
        const preset = model.accessPresets.find(
          (preset) => preset.id === resolve(operation.accessPresetId ?? "") && !preset.archived,
        );
        if (!preset) throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
        grants.push({ typeId: id, grants: preset.grants });
      }
    }
    if (operation.operation === "putType") {
      const input = resolveDefinition(operation.type) as Omit<RecordModel["types"][number], "archived">;
      const existing = current.types.find((candidate) => candidate.id === input.id);
      const type = {
        ...input,
        archived: existing?.archived ?? false,
        ...(input.relationshipPaths
          ? {
              relationshipPaths: input.relationshipPaths.map((path) => ({
                ...path,
                archived: existing?.relationshipPaths?.find((before) => before.id === path.id)?.archived ?? false,
              })),
            }
          : {}),
      } as RecordModel["types"][number];
      if ((existing?.parentRelationshipId ?? null) !== type.parentRelationshipId && !policy.canManageRoles)
        throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
      upsert(model.types, type);
    }
    if (operation.operation === "putField") {
      const input = resolveDefinition(operation.field) as Omit<RecordField, "publishedSummary" | "archived">;
      const existing = current.fields.find((candidate) => candidate.id === input.id);
      const field = { ...input, archived: existing?.archived ?? false };
      if (existing && existing.typeId !== field.typeId) throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
      if (existing && existing.position !== field.position) reorderedTypes.add(field.typeId);
      upsert(model.fields, {
        ...field,
        publishedSummary: field.behavior.kind === "input" ? false : (existing?.publishedSummary ?? false),
      });
    }
    if (operation.operation === "putRelationship") {
      const input = resolveDefinition(operation.relationship) as Omit<RecordModel["relationships"][number], "archived">;
      const existing = current.relationships.find((candidate) => candidate.id === input.id);
      const relation = { ...input, archived: existing?.archived ?? false };
      if (
        existing &&
        (existing.sourceTypeId !== relation.sourceTypeId || existing.targetTypeId !== relation.targetTypeId)
      )
        throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
      upsert(model.relationships, relation);
    }
    if (operation.operation === "setTypeGrants") {
      if (!policy.canManageRoles) throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
      const typeId = resolve(operation.typeId);
      if (
        grants.some((grant) => grant.typeId === typeId) ||
        new Set(operation.grants.map((grant) => grant.roleId)).size !== operation.grants.length ||
        operation.grants.some((grant) => new Set(grant.actions).size !== grant.actions.length) ||
        !(await validRoles(operation.grants.map((grant) => grant.roleId)))
      )
        throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
      if (!policy.isAdmin && policy.actor?.role) {
        const previous =
          previousGrants.find((grant) => grant.typeId === typeId && grant.roleId === policy.actor?.role?.id)?.actions ??
          [];
        const next = operation.grants.find((grant) => grant.roleId === policy.actor?.role?.id)?.actions ?? [];
        if ([...previous].sort().join() !== [...next].sort().join())
          throw unwindFailure(CustomErrorCode.roleSelfEditForbidden, "authorization");
      }
      grants.push({ typeId, grants: operation.grants });
    }
    if (operation.operation === "putCapability") {
      const binding = resolveDefinition(operation.capability) as RecordModel["capabilities"][number];
      const existing = current.capabilities.find((candidate) => candidate.id === binding.id);
      if (!policy.isAdmin) throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
      const protectedKind = (kind: string) => kind === "membershipAuthorization";
      if (
        (existing && (existing.typeId !== binding.typeId || existing.kind !== binding.kind)) ||
        (existing && protectedKind(existing.kind) && JSON.stringify(existing) !== JSON.stringify(binding)) ||
        (!existing && protectedKind(binding.kind))
      )
        throw unwindFailure(CustomErrorCode.recordProtected, "authorization");
      upsert(model.capabilities, binding);
    }
  }
  return { grants, reorderedTypes };
}

export function reorderConfiguredFields(model: RecordModel, reorderedTypes: Set<string>) {
  for (const typeId of reorderedTypes) {
    const slots = model.fields.flatMap((field, index) => (field.typeId === typeId ? [index] : []));
    const ordered = slots.map((index) => model.fields[index]).sort((left, right) => left.position - right.position);
    slots.forEach((slot, offset) => {
      model.fields[slot] = ordered[offset];
    });
  }
}
