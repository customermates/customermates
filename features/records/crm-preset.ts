import { recordInvariant } from "./record-invariant";

import { createHash } from "node:crypto";

import type {
  CalculationExpression,
  RecordField,
  RecordModel,
  RecordRelationship,
  RecordScalar,
  RecordType,
} from "./record-model.schema";

export function presetId(companyId: string, key: string): string {
  const hash = createHash("sha256").update(`customermates:records:v2:${companyId}:${key}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function createCrmPreset(companyId: string, currency: string): RecordModel {
  const types: RecordType[] = [];
  const fields: RecordField[] = [];
  const relationships: RecordRelationship[] = [];
  const id = (key: string) => presetId(companyId, key);
  const field = (key: string): CalculationExpression => ({
    kind: "field",
    fieldId: id(key),
  });
  const literal = (value: RecordScalar | null): CalculationExpression => ({
    kind: "literal",
    value,
  });
  const operation = (
    operator: Extract<CalculationExpression, { kind: "operation" }>["operator"],
    ...args: CalculationExpression[]
  ): CalculationExpression => ({
    kind: "operation",
    operator,
    arguments: args,
  });
  const related = (
    relation: string,
    direction: "outgoing" | "incoming",
    key: string,
    reducer: Extract<CalculationExpression, { kind: "related" }>["reducer"],
  ): CalculationExpression => ({
    kind: "related",
    relationId: id(relation),
    direction,
    expression: field(key),
    reducer,
  });

  const addField = (
    type: string,
    key: string,
    label: string,
    valueType: RecordField["valueType"],
    behavior: RecordField["behavior"] = { kind: "input" },
    required = false,
  ): RecordField => {
    const definition: RecordField = {
      id: id(key),
      typeId: id(type),
      label,
      valueType,
      behavior,
      required,
      archived: false,
      publishedSummary: false,
      options: [],
      position: fields.filter((value) => value.typeId === id(type)).length,
    };
    fields.push(definition);
    return definition;
  };

  for (const [key, label, pluralLabel, icon] of [
    ["contact", "Contact", "Contacts", "contact"],
    ["organization", "Organization", "Organizations", "building"],
    ["deal", "Deal", "Deals", "handshake"],
    ["service", "Service", "Services", "package"],
    ["task", "Task", "Tasks", "check"],
    ["lineItem", "Line item", "Line items", "list"],
  ]) {
    const name = addField(key, `${key}.name`, "Name", "text", { kind: "input" }, true);
    addField(key, `${key}.notes`, "Notes", "richText");
    types.push({
      id: id(key),
      label,
      pluralLabel,
      icon,
      description: "",
      primaryFieldId: name.id,
      parentRelationshipId: key === "lineItem" ? id("lineItem.deal") : null,
      archived: false,
      embedded: key === "lineItem",
      navigationVisible: key !== "lineItem",
      position: types.length,
      defaults: {
        columns: [name.id],
        hiddenColumns: [],
        layout: "table",
        groupBy: null,
        sortField: name.id,
        sortDirection: "asc",
        pinnedFields: [],
      },
    });
  }
  addField("contact", "contact.firstName", "First name", "text");
  addField("contact", "contact.lastName", "Last name", "text");
  addField("contact", "contact.avatarUrl", "Avatar", "url");
  recordInvariant(types.find((type) => type.id === id("contact"))).defaults.columns.push("system:channels");
  recordInvariant(types.find((type) => type.id === id("contact"))).defaults.hiddenColumns = [
    id("contact.firstName"),
    id("contact.lastName"),
    id("contact.avatarUrl"),
  ];
  recordInvariant(fields.find((value) => value.id === id("contact.name"))).behavior = {
    kind: "formula",
    expression: operation(
      "trim",
      operation(
        "concat",
        operation("coalesce", field("contact.firstName"), literal({ kind: "text", value: "" })),
        literal({ kind: "text", value: " " }),
        operation("coalesce", field("contact.lastName"), literal({ kind: "text", value: "" })),
      ),
    ),
  };

  const amount = addField(
    "service",
    "service.amount",
    "Price",
    "currency",
    {
      kind: "input",
      defaultValue: {
        kind: "decimal",
        value: "0",
        currency: currency.toUpperCase(),
      },
    },
    true,
  );
  recordInvariant(types.find((value) => value.id === id("service"))).defaults.columns.push(amount.id);

  const addRelation = (
    key: string,
    source: string,
    target: string,
    sourceLabel: string,
    targetLabel: string,
    sourceCardinality: "one" | "many" = "many",
    targetCardinality: "one" | "many" = "many",
    onSourceDelete: "unlink" | "restrict" | "cascade" = "unlink",
    onTargetDelete: "unlink" | "restrict" | "cascade" = "unlink",
  ) => {
    relationships.push({
      id: id(key),
      sourceTypeId: id(source),
      targetTypeId: id(target),
      sourceLabel,
      targetLabel,
      sourceCardinality,
      targetCardinality,
      onSourceDelete,
      onTargetDelete,
      archived: false,
    });
  };
  addRelation("contact.organizations", "contact", "organization", "Organizations", "Contacts");
  addRelation("deal.contacts", "deal", "contact", "Contacts", "Deals");
  addRelation("deal.organizations", "deal", "organization", "Organizations", "Deals");
  for (const [key, label] of [
    ["contact", "Contacts"],
    ["organization", "Organizations"],
    ["deal", "Deals"],
    ["service", "Services"],
  ])
    addRelation(`task.${key}s`, "task", key, label, "Tasks");
  addRelation("lineItem.deal", "lineItem", "deal", "Deal", "Line items", "one", "many", "unlink", "cascade");
  addRelation("lineItem.service", "lineItem", "service", "Service", "Line items", "one", "many", "unlink", "cascade");
  for (const [source, target, label] of [
    ["deal", "service", "Services"],
    ["service", "deal", "Deals"],
  ]) {
    const type = recordInvariant(types.find((type) => type.id === id(source)));
    type.defaults.hiddenColumns.push(`relationship:${id(`lineItem.${source}`)}:incoming`);
    type.relationshipPaths = [
      {
        id: id(`${source}.${target}s.path`),
        label,
        archived: false,
        path: [
          { relationId: id(`lineItem.${source}`), direction: "incoming" },
          { relationId: id(`lineItem.${target}`), direction: "outgoing" },
        ],
      },
    ];
  }

  addField(
    "lineItem",
    "lineItem.quantity",
    "Quantity",
    "number",
    {
      kind: "input",
      defaultValue: { kind: "decimal", value: "1", currency: null },
    },
    true,
  );
  const mode = addField(
    "lineItem",
    "lineItem.pricingMode",
    "Pricing",
    "select",
    { kind: "input", defaultValue: { kind: "select", value: "live" } },
    true,
  );
  recordInvariant(fields.find((field) => field.id === id("lineItem.name"))).behavior = {
    kind: "input",
    defaultValue: { kind: "text", value: "Line item" },
  };
  mode.options = ["live", "saved"].map((value) => ({
    id: value,
    label: value === "live" ? "Live price" : "Saved price",
    color: null,
    attributes: [],
  }));
  addField("lineItem", "lineItem.savedPrice", "Saved unit price", "currency", {
    kind: "snapshot",
    capture: "whenChanged",
    allowManualOverride: true,
    triggerFieldId: id("lineItem.pricingMode"),
    triggerValue: { kind: "select", value: "saved" },
    expression: related("lineItem.service", "outgoing", "service.amount", "one"),
  });
  addField("lineItem", "lineItem.effectivePrice", "Unit price", "currency", {
    kind: "formula",
    expression: operation(
      "if",
      operation("equal", field("lineItem.pricingMode"), literal({ kind: "select", value: "saved" })),
      field("lineItem.savedPrice"),
      related("lineItem.service", "outgoing", "service.amount", "one"),
    ),
  });
  addField("lineItem", "lineItem.amount", "Amount", "currency", {
    kind: "formula",
    expression: operation("multiply", field("lineItem.quantity"), field("lineItem.effectivePrice")),
  });

  const stage = addField("deal", "deal.stage", "Stage", "select");
  stage.options = [
    ["new", "New", "10"],
    ["qualified", "Qualified", "25"],
    ["proposal", "Proposal", "60"],
    ["won", "Won", "100"],
    ["lost", "Lost", "0"],
  ].map(([key, label, probability]) => ({
    id: id(`deal.stage.${key}`),
    label,
    color: null,
    attributes: [
      {
        key: "probability",
        value: { kind: "decimal", value: probability, currency: null },
      },
    ],
  }));
  addField("deal", "deal.totalValue", "Value", "currency", {
    kind: "rollup",
    expression: related("lineItem.deal", "incoming", "lineItem.amount", "sum"),
  });
  addField("deal", "deal.totalQuantity", "Quantity", "number", {
    kind: "rollup",
    expression: related("lineItem.deal", "incoming", "lineItem.quantity", "sum"),
  });
  addField("deal", "deal.weightedValue", "Weighted value", "currency", {
    kind: "formula",
    expression: operation(
      "divide",
      operation("multiply", field("deal.totalValue"), {
        kind: "optionAttribute",
        fieldId: stage.id,
        attribute: "probability",
      }),
      literal({ kind: "decimal", value: "100", currency: null }),
    ),
  });
  const deals = recordInvariant(types.find((value) => value.id === id("deal")));
  deals.defaults.columns.push(stage.id, id("deal.totalValue"), id("deal.weightedValue"));
  deals.defaults.groupBy = stage.id;
  deals.defaults.groupSummaries = [
    { fieldId: id("deal.totalValue"), aggregation: "sum" },
    { fieldId: id("deal.weightedValue"), aggregation: "sum" },
  ];
  const lines = recordInvariant(types.find((value) => value.id === id("lineItem")));
  lines.defaults.columns.push(
    id("lineItem.quantity"),
    id("lineItem.pricingMode"),
    id("lineItem.effectivePrice"),
    id("lineItem.amount"),
  );

  return {
    revision: 1,
    types,
    fields,
    relationships,
    accessPresets: [],
    capabilities: [
      {
        id: id("capability.identity"),
        kind: "channels",
        providerAvatar: true,
        typeId: id("contact"),
        fields: [
          { role: "firstName", fieldId: id("contact.firstName") },
          { role: "lastName", fieldId: id("contact.lastName") },
        ],
      },
      {
        id: id("capability.avatar"),
        kind: "avatar",
        typeId: id("contact"),
        fields: [{ role: "image", fieldId: id("contact.avatarUrl") }],
      },
      {
        id: id("capability.membership"),
        kind: "membershipAuthorization",
        typeId: id("task"),
        fields: [],
      },
    ],
    activityPaths: [
      ...types.map((type) => ({
        id: id(`activities:${type.id}:self`),
        typeId: type.id,
        label: type.pluralLabel,
        path: [],
        includeMessages: type.id === id("contact"),
        includeAudit: true,
        archived: false,
      })),
      ...[
        { key: "organization", path: [{ relationId: id("contact.organizations"), direction: "incoming" as const }] },
        { key: "deal", path: [{ relationId: id("deal.contacts"), direction: "outgoing" as const }] },
        {
          key: "service",
          path: [
            { relationId: id("lineItem.service"), direction: "incoming" as const },
            { relationId: id("lineItem.deal"), direction: "outgoing" as const },
            { relationId: id("deal.contacts"), direction: "outgoing" as const },
          ],
        },
        { key: "task", path: [{ relationId: id("task.contacts"), direction: "outgoing" as const }] },
      ].map(({ key, path }) => ({
        id: id(`activities:${id(key)}:people`),
        typeId: id(key),
        label: "Contacts",
        path,
        includeMessages: true,
        includeAudit: false,
        archived: false,
      })),
    ],
  };
}
