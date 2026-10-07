import type {
  RecordFieldView,
  RecordModelView,
  RecordRelationship,
  RecordType,
} from "@/features/records/record-model.schema";
import type { DiscoveredRecordTypes } from "@/features/records/discover-record-types.interactor";

import { recordChannelsEnabled } from "@/features/records/record-channels";
import {
  expressionFieldDependencies,
  expressionRelationshipDependencies,
} from "@/features/records/record-model-validation";

import { configureLists, configureParentId } from "./configure-model";

export type ConfigureGraphCatalog = ReadonlyArray<Pick<DiscoveredRecordTypes["types"][number], "id" | "recordCount">>;

export const ACCOUNTS_NODE_ID = "accounts";

type ConfigureCardinality = "oneToOne" | "oneToMany" | "manyToOne" | "manyToMany";

export type ConfigureGraphSource = {
  id: string;
  provider: string;
  status: string;
  address: string | null;
  hasMessaging: boolean;
  hasCalendar: boolean;
  linkedinProducts: string[];
};

type ConfigureGraphField = {
  field: RecordFieldView;
  calculated: boolean;
  sources: string[];
};

export type ConfigureGraphList = {
  type: RecordType;
  recordCount: number | null | undefined;
  parentId: string | null;
  fields: ConfigureGraphField[];
};

export type ConfigureGraphEdge =
  | {
      kind: "relationship";
      id: string;
      relation: RecordRelationship;
      cardinality: ConfigureCardinality;
      parent: boolean;
      calculatedFields: string[];
    }
  | { kind: "calculation"; id: string; source: string; target: string; fields: string[] }
  | { kind: "account"; id: string; source: string; target: string };

export type ConfigureGraphData = {
  lists: ConfigureGraphList[];
  sources: ConfigureGraphSource[];
  edges: ConfigureGraphEdge[];
};

export function configureCardinality(
  relation: Pick<RecordRelationship, "sourceCardinality" | "targetCardinality">,
): ConfigureCardinality {
  const left = relation.targetCardinality === "one" ? "one" : "many";
  const right = relation.sourceCardinality === "one" ? "One" : "Many";
  return `${left}To${right}`;
}

export function configureCalculationSources(model: RecordModelView, field: RecordFieldView) {
  if (field.behavior.kind === "input" || !field.behavior.expression) return { sources: [], lists: [] };
  const { expression } = field.behavior;
  const lists = new Set(
    [...expressionRelationshipDependencies(expression)].flatMap((relationId) => {
      const relation = model.relationships.find((candidate) => candidate.id === relationId);
      return relation ? [relation.sourceTypeId, relation.targetTypeId].filter((id) => id !== field.typeId) : [];
    }),
  );
  const listLabel = (typeId: string) => model.types.find((type) => type.id === typeId)?.pluralLabel;
  const sources = new Map<string, string>();
  const listsWithFields = new Set<string>();
  for (const fieldId of expressionFieldDependencies(expression)) {
    const source = model.fields.find((candidate) => candidate.id === fieldId);
    if (!source) continue;
    const list = source.typeId === field.typeId ? undefined : listLabel(source.typeId);
    if (list) listsWithFields.add(source.typeId);
    sources.set(source.id, list ? `${list} · ${source.label}` : source.label);
  }
  for (const typeId of lists) {
    const label = listLabel(typeId);
    if (label && !listsWithFields.has(typeId)) sources.set(typeId, label);
  }
  return { sources: [...sources.values()], lists: [...lists] };
}

export function configureGraphData(
  model: RecordModelView,
  catalog: ConfigureGraphCatalog,
  accounts: ConfigureGraphSource[],
  showArchived: boolean,
  connectPrompt = false,
): ConfigureGraphData {
  const counts = new Map(catalog.map((type) => [type.id, type]));
  const types = configureLists(model, showArchived);
  const visible = new Set(types.map((type) => type.id));
  const calculations = new Map<string, { source: string; target: string; fields: string[] }>();
  const lists = types.map((type) => ({
    type,
    recordCount: counts.get(type.id)?.recordCount,
    parentId: configureParentId(model, type),
    fields: model.fields
      .filter((field) => field.typeId === type.id && (!field.archived || showArchived))
      .sort((left, right) => left.position - right.position)
      .map((field) => {
        const calculated = field.behavior.kind !== "input";
        const { sources, lists: related } = configureCalculationSources(model, field);
        for (const source of related) {
          if (source === type.id || !visible.has(source)) continue;
          const key = `${source}:${type.id}`;
          const entry = calculations.get(key) ?? { source, target: type.id, fields: [] };
          entry.fields.push(field.label);
          calculations.set(key, entry);
        }
        return { field, calculated, sources };
      }),
  }));
  const relationships: ConfigureGraphEdge[] = model.relationships
    .filter(
      (relation) =>
        (!relation.archived || showArchived) &&
        visible.has(relation.sourceTypeId) &&
        visible.has(relation.targetTypeId),
    )
    .map((relation) => ({
      kind: "relationship",
      id: `relationship:${relation.id}`,
      relation,
      cardinality: configureCardinality(relation),
      parent: types.some((type) => type.parentRelationshipId === relation.id && type.id === relation.sourceTypeId),
      calculatedFields: [],
    }));
  const standalone = [...calculations.values()].filter((entry) => {
    const carrier = relationships.find(
      (edge) =>
        edge.kind === "relationship" &&
        [edge.relation.sourceTypeId, edge.relation.targetTypeId].sort().join(":") ===
          [entry.source, entry.target].sort().join(":"),
    );
    if (carrier?.kind !== "relationship") return true;
    carrier.calculatedFields.push(...entry.fields);
    return false;
  });
  const channelLists = types.filter((type) => !type.archived && recordChannelsEnabled(model, type.id));
  const calendarLists = types.filter(
    (type) =>
      !type.archived &&
      model.capabilities.some(
        (binding) => binding.kind === "calendar" && binding.enabled !== false && binding.typeId === type.id,
      ),
  );
  const targets = new Set(
    accounts.length
      ? accounts.flatMap((account) => [
          ...(account.hasMessaging || !account.hasCalendar ? channelLists : []),
          ...(account.hasCalendar ? calendarLists : []),
        ])
      : connectPrompt
        ? channelLists
        : [],
  );
  const accountEdges: ConfigureGraphEdge[] = [...targets].map((type) => ({
    kind: "account",
    id: `account:${type.id}`,
    source: ACCOUNTS_NODE_ID,
    target: type.id,
  }));
  return {
    lists,
    sources: accounts,
    edges: [
      ...relationships,
      ...standalone.map((entry) => ({
        kind: "calculation" as const,
        id: `calculation:${entry.source}:${entry.target}`,
        ...entry,
      })),
      ...accountEdges,
    ],
  };
}
