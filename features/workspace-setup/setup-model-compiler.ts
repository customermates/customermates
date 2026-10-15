import type { z } from "zod";
import type { ChipColor } from "@/constants/chip-colors";
import type { ConfigurationChange } from "@/features/records/configuration.schema";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { SetupExpression, SetupNewField, SetupOption, SetupPlan } from "./setup-plan.schema";
import type { SetupCompileIssue, SetupCompileResult } from "./setup-references";

import { PublicConfigurationChangeSchema } from "@/features/records/configuration.schema";

import {
  SETUP_AVATAR_CAPABILITY,
  SETUP_DEAL_OFFERINGS_PATH,
  SETUP_LINE_ITEM_DEAL,
  SETUP_LINE_ITEM_LIST,
  SETUP_LINE_ITEM_OFFERING,
  SETUP_MEMBERSHIP_CAPABILITY,
  SETUP_OFFERING_DEALS_PATH,
  setupAnchorFields,
  setupLineItemField,
  setupLineItems,
  setupRoleList,
} from "./setup-anchors";
import {
  setupCapabilityReference,
  setupFieldReference,
  setupIdempotencyKey,
  setupListReference,
  setupNameReference,
  setupPathReference,
  setupRelationshipReference,
} from "./setup-references";

type ConfigurationInput = z.input<typeof PublicConfigurationChangeSchema>;
type Operation = ConfigurationInput["operations"][number];
type FieldDefinition = Extract<Operation, { operation: "putField" }>["field"];
type TypeDefinition = Extract<Operation, { operation: "putType" }>["type"];
type Expression = NonNullable<Extract<FieldDefinition["behavior"], { expression?: unknown }>["expression"]>;

export type SetupModelLabels = {
  channels: string;
  avatar: string;
  value: string;
  price: string;
  lineItem: string;
  lineItems: string;
  quantity: string;
  pricingMode: string;
  savedPrice: string;
  effectivePrice: string;
  amount: string;
  livePrice: string;
  savedPriceMode: string;
};

export type SetupModelContext = {
  setupId: string;
  model: RecordModel;
  labels: SetupModelLabels;
  brandChip?: ChipColor | null;
};

const PROBABILITY = "probability";
const SAVED_PRICE = "saved";
const LIVE_PRICE = "live";

function optionColor(option: SetupOption, index: number, count: number): ChipColor {
  if (option.color) return option.color;
  if (option.outcome === "won") return "success";
  if (option.outcome === "lost") return "destructive";
  if (index === 0) return "secondary";
  return index < count / 2 ? "info" : "warning";
}

function optionWeight(option: SetupOption, index: number, open: number): number {
  if (option.weight !== undefined) return option.weight;
  if (option.outcome === "won") return 100;
  if (option.outcome === "lost") return 0;
  return Math.round(((index + 1) / (open + 1)) * 90);
}

function isOpen(option: SetupOption): boolean {
  return !option.outcome || option.outcome === "open";
}

function choiceOptions(field: SetupNewField): Pick<FieldDefinition, "options" | "behavior"> {
  const weighted = field.options.some((option) => option.weight !== undefined || option.outcome !== undefined);
  const open = field.options.filter(isOpen).length;
  let openIndex = 0;
  const options = field.options.map((option, position) => {
    const weight = weighted ? optionWeight(option, openIndex, open) : undefined;
    if (isOpen(option)) openIndex += 1;
    return {
      id: option.key,
      label: option.label,
      color: optionColor(option, position, field.options.length),
      attributes:
        weight === undefined
          ? []
          : [{ key: PROBABILITY, value: { kind: "decimal" as const, value: String(weight), currency: null } }],
    };
  });
  const first = weighted ? field.options.find(isOpen) : undefined;
  return {
    options,
    behavior: first ? { kind: "input", defaultValue: { kind: "select", value: first.key } } : { kind: "input" },
  };
}

export function compileSetupRecordModel(
  plan: SetupPlan,
  context: SetupModelContext,
): SetupCompileResult<ConfigurationChange> {
  const { model, labels } = context;
  const currency = plan.workspace.currency;
  const issues: SetupCompileIssue[] = [];
  const fail = (code: string, path: string) => {
    issues.push({ code, path });
    return undefined;
  };
  const planLists = new Map(plan.recordModel.lists.map((list) => [list.key, list]));
  const people = setupRoleList(plan, "people");
  const tasks = setupRoleList(plan, "tasks");
  const deals = setupRoleList(plan, "deals");
  const offerings = setupRoleList(plan, "offerings");
  const lineItems = setupLineItems(plan);
  const resolveList = (key: string) => (planLists.has(key) ? setupListReference(key) : undefined);
  const typeId = (key: string, path: string): string | undefined => resolveList(key) ?? fail("unknown_list", path);
  const planned = new Set([
    ...plan.recordModel.fields.map((field) => field.key),
    ...plan.recordModel.calculations.map((field) => field.key),
    ...setupAnchorFields(plan.recordModel.lists),
  ]);
  const fieldId = (ref: string, path: string): string | undefined => {
    const [list, name] = ref.split(".");
    if (planLists.has(list) && name === "name") return setupNameReference(list);
    if (planned.has(ref)) return setupFieldReference(ref);
    return fail("unknown_field", path);
  };
  const fieldList = (ref: string) => ref.split(".")[0];
  const relationshipId = (ref: string, path: string): string | undefined =>
    plan.recordModel.relationships.some((relation) => relation.key === ref)
      ? setupRelationshipReference(ref)
      : fail("unknown_relationship", path);
  const compileExpression = (expression: SetupExpression, path: string): Expression | undefined => {
    switch (expression.op) {
      case "field": {
        const id = fieldId(expression.field, path);
        return id ? { kind: "field", fieldId: id } : undefined;
      }
      case "number":
        return { kind: "literal", value: { kind: "decimal", value: expression.value, currency: null } };
      case "optionWeight": {
        const id = fieldId(expression.field, path);
        return id ? { kind: "optionAttribute", fieldId: id, attribute: PROBABILITY } : undefined;
      }
      case "daysBetween": {
        const from = fieldId(expression.from, path);
        const to = fieldId(expression.to, path);
        return from && to
          ? {
              kind: "operation",
              operator: "daysBetween",
              arguments: [
                { kind: "field", fieldId: from },
                { kind: "field", fieldId: to },
              ],
            }
          : undefined;
      }
      case "related": {
        const relationId = relationshipId(expression.relationship, path);
        const id = fieldId(expression.field, path);
        return relationId && id
          ? {
              kind: "related",
              relationId,
              direction: expression.direction,
              expression: { kind: "field", fieldId: id },
              reducer: expression.reducer,
            }
          : undefined;
      }
      default: {
        const left = compileExpression(expression.left, path);
        const right = compileExpression(expression.right, path);
        return left && right ? { kind: "operation", operator: expression.op, arguments: [left, right] } : undefined;
      }
    }
  };

  const lineItemList = setupListReference(SETUP_LINE_ITEM_LIST);
  const lineItemDeal = setupRelationshipReference(SETUP_LINE_ITEM_DEAL);
  const lineItemOffering = setupRelationshipReference(SETUP_LINE_ITEM_OFFERING);
  const lineField = (name: Parameters<typeof setupLineItemField>[0]) => setupFieldReference(setupLineItemField(name));
  const priceRef = offerings ? setupFieldReference(`${offerings}.price`) : null;
  const relationshipPaths = new Map<string, NonNullable<TypeDefinition["relationshipPaths"]>>();
  if (lineItems) {
    const dealList = planLists.get(lineItems.deals);
    const offeringList = planLists.get(lineItems.offerings);
    relationshipPaths.set(lineItems.deals, [
      {
        id: setupPathReference(SETUP_DEAL_OFFERINGS_PATH),
        label: offeringList?.pluralLabel ?? lineItems.offerings,
        path: [
          { relationId: lineItemDeal, direction: "incoming" },
          { relationId: lineItemOffering, direction: "outgoing" },
        ],
      },
    ]);
    relationshipPaths.set(lineItems.offerings, [
      {
        id: setupPathReference(SETUP_OFFERING_DEALS_PATH),
        label: dealList?.pluralLabel ?? lineItems.deals,
        path: [
          { relationId: lineItemOffering, direction: "incoming" },
          { relationId: lineItemDeal, direction: "outgoing" },
        ],
      },
    ]);
  }

  const operations: Operation[] = [];
  const nextPosition = Math.max(-1, ...model.types.map((type) => type.position)) + 1;
  plan.recordModel.lists.forEach((list, index) => {
    const reference = setupListReference(list.key);
    operations.push({
      operation: "createType",
      reference,
      label: list.label,
      pluralLabel: list.pluralLabel,
      description: list.description,
      icon: list.icon,
      embedded: false,
      accessPresetId: null,
    });
    const color = list.color ?? context.brandChip ?? undefined;
    const paths = relationshipPaths.get(list.key);
    if (!color && !paths) return;
    operations.push({
      operation: "putType",
      type: {
        id: reference,
        label: list.label,
        pluralLabel: list.pluralLabel,
        description: list.description,
        icon: list.icon,
        ...(color ? { color } : {}),
        primaryFieldId: setupNameReference(list.key),
        parentRelationshipId: null,
        embedded: false,
        navigationVisible: true,
        position: nextPosition + index,
        ...(paths ? { relationshipPaths: paths } : {}),
      },
    });
  });
  if (lineItems) {
    operations.push(
      {
        operation: "createType",
        reference: lineItemList,
        label: labels.lineItem,
        pluralLabel: labels.lineItems,
        description: "",
        icon: "list",
        embedded: true,
        accessPresetId: null,
      },
      {
        operation: "putType",
        type: {
          id: lineItemList,
          label: labels.lineItem,
          pluralLabel: labels.lineItems,
          description: "",
          icon: "list",
          primaryFieldId: setupNameReference(SETUP_LINE_ITEM_LIST),
          parentRelationshipId: lineItemDeal,
          embedded: true,
          navigationVisible: false,
          position: nextPosition + plan.recordModel.lists.length,
        },
      },
    );
  }

  plan.recordModel.relationships.forEach((relation, index) => {
    const path = `recordModel.relationships.${index}`;
    const sourceTypeId = typeId(relation.source, path);
    const targetTypeId = typeId(relation.target, path);
    if (!sourceTypeId || !targetTypeId) return;
    operations.push({
      operation: "putRelationship",
      relationship: {
        id: setupRelationshipReference(relation.key),
        sourceTypeId,
        targetTypeId,
        sourceLabel: relation.sourceLabel,
        targetLabel: relation.targetLabel,
        sourceCardinality: relation.sourceCardinality,
        targetCardinality: relation.targetCardinality,
        onSourceDelete: "unlink",
        onTargetDelete: "unlink",
        messagesOnSource: people !== null && relation.target === people,
        messagesOnTarget: people !== null && relation.source === people,
      },
    });
  });
  if (lineItems) {
    for (const [reference, target] of [
      [lineItemDeal, lineItems.deals],
      [lineItemOffering, lineItems.offerings],
    ] as const) {
      operations.push({
        operation: "putRelationship",
        relationship: {
          id: reference,
          sourceTypeId: lineItemList,
          targetTypeId: setupListReference(target),
          sourceLabel: planLists.get(target)?.label ?? target,
          targetLabel: labels.lineItems,
          sourceCardinality: "one",
          targetCardinality: "many",
          onSourceDelete: "unlink",
          onTargetDelete: "cascade",
        },
      });
    }
  }

  const definitions = new Map<string, FieldDefinition>();
  const added: string[] = [];
  const define = (ref: string, definition: Omit<FieldDefinition, "id" | "position">) => {
    added.push(ref);
    definitions.set(ref, { ...definition, id: ref, position: 0 });
  };
  plan.recordModel.fields.forEach((field, index) => {
    const list = typeId(fieldList(field.key), `recordModel.fields.${index}`);
    if (!list) return;
    const choice: Pick<FieldDefinition, "options" | "behavior"> =
      field.valueType === "select" ? choiceOptions(field) : { options: [], behavior: { kind: "input" } };
    define(setupFieldReference(field.key), {
      typeId: list,
      label: field.label,
      valueType: field.valueType,
      behavior: choice.behavior,
      required: field.required,
      ...(field.multiple ? { multiple: true } : {}),
      ...(field.valueType === "currency" ? { format: { currency } } : {}),
      options: choice.options,
    });
  });
  plan.recordModel.calculations.forEach((field, index) => {
    const path = `recordModel.calculations.${index}`;
    const list = typeId(fieldList(field.key), path);
    const expression = compileExpression(field.expression, path);
    if (!list || !expression) return;
    const kind =
      field.expression.op === "related" ? (field.expression.reducer === "one" ? "lookup" : "rollup") : "formula";
    define(setupFieldReference(field.key), {
      typeId: list,
      label: field.label,
      valueType: field.valueType,
      behavior: { kind, expression },
      required: false,
      ...(field.valueType === "currency" ? { format: { currency } } : {}),
      options: [],
    });
  });
  if (people) {
    const list = setupListReference(people);
    define(setupFieldReference(`${people}.channels`), {
      typeId: list,
      label: labels.channels,
      valueType: "channels",
      behavior: { kind: "input" },
      required: false,
      format: { onClick: "open", providerAvatar: true },
      options: [],
    });
    define(setupFieldReference(`${people}.avatar`), {
      typeId: list,
      label: labels.avatar,
      valueType: "url",
      behavior: { kind: "input" },
      required: false,
      options: [],
    });
  }
  if (offerings && priceRef)
    define(priceRef, {
      typeId: setupListReference(offerings),
      label: labels.price,
      valueType: "currency",
      behavior: { kind: "input", defaultValue: { kind: "decimal", value: "0", currency } },
      required: true,
      format: { currency },
      options: [],
    });
  if (deals)
    define(setupFieldReference(`${deals}.value`), {
      typeId: setupListReference(deals),
      label: labels.value,
      valueType: "currency",
      behavior: lineItems
        ? {
            kind: "rollup",
            expression: {
              kind: "related",
              relationId: lineItemDeal,
              direction: "incoming",
              expression: { kind: "field", fieldId: lineField("amount") },
              reducer: "sum",
            },
          }
        : { kind: "input" },
      required: false,
      format: { currency },
      options: [],
    });

  for (const list of plan.recordModel.lists) {
    const reference = setupListReference(list.key);
    const defaultIndex = plan.listDefaults.findIndex((value) => value.list === list.key);
    const columns =
      defaultIndex < 0
        ? []
        : plan.listDefaults[defaultIndex].columns.flatMap((column, index) => {
            const path = `listDefaults.${defaultIndex}.columns.${index}`;
            if (fieldList(column) !== list.key) return fail("column_outside_list", path) ?? [];
            return fieldId(column, path) ?? [];
          });
    const fresh = added.filter((ref) => definitions.get(ref)?.typeId === reference);
    [...new Set([...columns, ...fresh])]
      .filter((ref) => definitions.has(ref))
      .forEach((ref, index) => {
        const definition = definitions.get(ref);
        if (definition) definition.position = index + 1;
      });
  }

  if (lineItems && priceRef) {
    const savedPrice: Expression = {
      kind: "related",
      relationId: lineItemOffering,
      direction: "outgoing",
      expression: { kind: "field", fieldId: priceRef },
      reducer: "one",
    };
    const lineDefinitions: FieldDefinition[] = [
      {
        id: setupNameReference(SETUP_LINE_ITEM_LIST),
        typeId: lineItemList,
        label: labels.lineItem,
        valueType: "text",
        behavior: { kind: "input", defaultValue: { kind: "text", value: labels.lineItem } },
        required: true,
        options: [],
        position: 0,
      },
      {
        id: lineField("quantity"),
        typeId: lineItemList,
        label: labels.quantity,
        valueType: "number",
        behavior: { kind: "input", defaultValue: { kind: "decimal", value: "1", currency: null } },
        required: true,
        options: [],
        position: 1,
      },
      {
        id: lineField("pricingMode"),
        typeId: lineItemList,
        label: labels.pricingMode,
        valueType: "select",
        behavior: { kind: "input", defaultValue: { kind: "select", value: LIVE_PRICE } },
        required: true,
        options: [
          { id: LIVE_PRICE, label: labels.livePrice, color: null, attributes: [] },
          { id: SAVED_PRICE, label: labels.savedPriceMode, color: null, attributes: [] },
        ],
        position: 2,
      },
      {
        id: lineField("savedPrice"),
        typeId: lineItemList,
        label: labels.savedPrice,
        valueType: "currency",
        behavior: {
          kind: "snapshot",
          capture: "whenChanged",
          allowManualOverride: true,
          triggerFieldId: lineField("pricingMode"),
          triggerValue: { kind: "select", value: SAVED_PRICE },
          expression: savedPrice,
        },
        required: false,
        format: { currency },
        options: [],
        position: 3,
      },
      {
        id: lineField("effectivePrice"),
        typeId: lineItemList,
        label: labels.effectivePrice,
        valueType: "currency",
        behavior: {
          kind: "formula",
          expression: {
            kind: "operation",
            operator: "if",
            arguments: [
              {
                kind: "operation",
                operator: "equal",
                arguments: [
                  { kind: "field", fieldId: lineField("pricingMode") },
                  { kind: "literal", value: { kind: "select", value: SAVED_PRICE } },
                ],
              },
              { kind: "field", fieldId: lineField("savedPrice") },
              savedPrice,
            ],
          },
        },
        required: false,
        format: { currency },
        options: [],
        position: 4,
      },
      {
        id: lineField("amount"),
        typeId: lineItemList,
        label: labels.amount,
        valueType: "currency",
        behavior: {
          kind: "formula",
          expression: {
            kind: "operation",
            operator: "multiply",
            arguments: [
              { kind: "field", fieldId: lineField("quantity") },
              { kind: "field", fieldId: lineField("effectivePrice") },
            ],
          },
        },
        required: false,
        format: { currency },
        options: [],
        position: 5,
      },
    ];
    for (const definition of lineDefinitions) definitions.set(definition.id, definition);
  }

  if (issues.length) return { ok: false, issues };
  for (const definition of definitions.values()) operations.push({ operation: "putField", field: definition });
  if (people)
    operations.push({
      operation: "putCapability",
      capability: {
        id: setupCapabilityReference(SETUP_AVATAR_CAPABILITY),
        kind: "avatar",
        typeId: setupListReference(people),
        fields: [{ role: "image", fieldId: setupFieldReference(`${people}.avatar`) }],
      },
    });
  if (tasks && !model.capabilities.some((binding) => binding.kind === "membershipAuthorization"))
    operations.push({
      operation: "putCapability",
      capability: {
        id: setupCapabilityReference(SETUP_MEMBERSHIP_CAPABILITY),
        kind: "membershipAuthorization",
        typeId: setupListReference(tasks),
        fields: [],
      },
    });

  const parsed = PublicConfigurationChangeSchema.safeParse({
    expectedRevision: model.revision,
    idempotencyKey: setupIdempotencyKey(context.setupId, "record-model"),
    operations,
  } satisfies ConfigurationInput);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({ code: "invalid_bundle", path: issue.path.join(".") })),
    };
  }
  return { ok: true, data: parsed.data };
}
