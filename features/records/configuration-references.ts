import { unwindFailure } from "@/core/validation/failure-unwind";
import { CustomErrorCode } from "@/core/validation/validation.types";

import type { ConfigurationChange } from "./configuration.schema";

import { deterministicId } from "./deterministic-id";

const RESOLVED_KEYS = [
  "id",
  "typeId",
  "fieldId",
  "primaryFieldId",
  "parentRelationshipId",
  "triggerFieldId",
  "relationId",
  "sourceTypeId",
  "targetTypeId",
];
const LITERAL_KEYS = ["value", "defaultValue", "triggerValue", "options"];

export type ConfigurationReferences = {
  references: Map<string, string>;
  resolve: (reference: string) => string;
  resolveDefinition: (value: unknown, key?: string) => unknown;
};

export function configurationReferences(input: ConfigurationChange, companyId: () => string): ConfigurationReferences {
  const references = new Map<string, string>();
  const register = (reference: string, generated = false) => {
    if (!reference.startsWith("$")) return;
    if (references.has(reference)) {
      if (generated) return;
      throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
    }
    references.set(reference, deterministicId(companyId(), `configuration:${input.idempotencyKey}:${reference}`));
  };
  for (const operation of input.operations) {
    if (operation.operation === "createType") register(operation.reference);
    if (operation.operation === "putType") for (const path of operation.type.relationshipPaths ?? []) register(path.id);
    if (operation.operation === "putField") register(operation.field.id);
    if (operation.operation === "putRelationship") register(operation.relationship.id);
    if (operation.operation === "putAccessPreset") register(operation.preset.id);
    if (operation.operation === "putCapability") register(operation.capability.id);
  }
  for (const operation of input.operations)
    if (operation.operation === "createType") register(`${operation.reference}.name`, true);

  const resolve = (reference: string): string => {
    if (reference.startsWith("path:$")) return `path:${resolve(reference.slice(5))}`;
    if (reference.startsWith("relationship:$")) {
      const [, relationId, direction] = reference.split(":");
      return `relationship:${resolve(relationId)}:${direction}`;
    }
    if (!reference.startsWith("$")) return reference;
    const id = references.get(reference);
    if (!id) throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
    return id;
  };
  const resolveDefinition = (value: unknown, key = ""): unknown => {
    if (typeof value === "string" && RESOLVED_KEYS.includes(key)) return resolve(value);
    if (Array.isArray(value)) return value.map((item) => resolveDefinition(item, key));
    if (!value || typeof value !== "object" || LITERAL_KEYS.includes(key)) return value;
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, resolveDefinition(child, childKey)]),
    );
  };
  return { references, resolve, resolveDefinition };
}
