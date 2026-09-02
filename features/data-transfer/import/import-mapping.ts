import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { ImportEntityDescriptor } from "./import-entity.registry";
import type { SchemaSheetRow } from "../workbook-columns";

import { MessagingProvider } from "@/generated/prisma";

import { RECORD_ID_COLUMN_KEY } from "../workbook-columns";

export type MappingTarget =
  | { kind: "ignore" }
  | { kind: "recordId" }
  | { kind: "field"; key: string }
  | { kind: "customField"; columnId: string }
  | { kind: "identifier"; provider: string };

export type SourceColumn = {
  index: number;
  letter: string;
  header: string;
  samples: string[];
};

export const AUTO_MATCH_THRESHOLD = 70;

export const IDENTIFIER_TARGET_PREFIX = "identifier:";

const MESSAGING_PROVIDERS = new Set<string>(Object.values(MessagingProvider));

export function identifierTargetFor(key: string): MappingTarget | null {
  if (!key.startsWith(IDENTIFIER_TARGET_PREFIX)) return null;

  const provider = key.slice(IDENTIFIER_TARGET_PREFIX.length);

  return MESSAGING_PROVIDERS.has(provider) ? { kind: "identifier", provider } : null;
}

const FIELD_SYNONYMS: Record<string, string[]> = {
  amount: ["amount", "price", "value", "betrag", "preis", "montant", "importe", "prezzo"],
  contactIds: ["contacts", "kontakte", "contactos", "contatti"],
  dealIds: ["deals", "opportunities", "abschlusse", "oportunidades"],
  firstName: ["firstname", "givenname", "vorname", "prenom", "nombre", "nome"],
  lastName: ["lastname", "surname", "familyname", "nachname", "nom", "apellido", "cognome"],
  name: ["name", "title", "companyname", "accountname", "dealname", "firmenname", "titel"],
  notes: ["notes", "note", "description", "comments", "notizen", "beschreibung", "descripcion"],
  organizationIds: ["organizations", "companies", "accounts", "organisationen", "firmen", "empresas"],
  serviceIds: ["services", "products", "leistungen", "servicios", "servizi"],
  services: ["services", "products", "leistungen", "servicios", "servizi"],
  taskIds: ["tasks", "todos", "aufgaben", "tareas", "attivita"],
  userIds: ["assigned", "owner", "assignee", "zugewiesen", "verantwortlich", "asignado"],
};

const RECORD_ID_SYNONYMS = ["id", "recordid", "customermatesid", RECORD_ID_COLUMN_KEY.toLowerCase()];

export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_\-./]+/g, "")
    .replace(/[()[\]]/g, "");
}

export function columnLetter(index: number): string {
  let remaining = index + 1;
  let letter = "";

  while (remaining > 0) {
    const modulo = (remaining - 1) % 26;
    letter = String.fromCharCode(65 + modulo) + letter;
    remaining = Math.floor((remaining - modulo) / 26);
  }

  return letter;
}

function columnUidOf(field: { labelKey: string }): string {
  return field.labelKey.split(".").at(-1) ?? "";
}

function targetFromSchemaKey(key: string, descriptor: ImportEntityDescriptor): MappingTarget {
  if (key === RECORD_ID_COLUMN_KEY) return { kind: "recordId" };

  const identifier = descriptor.supportsIdentifiers ? identifierTargetFor(key) : null;
  if (identifier) return identifier;
  if (descriptor.fields.some((field) => field.key === key)) return { kind: "field", key };

  const byColumnUid = descriptor.fields.find((field) => columnUidOf(field) === key);
  if (byColumnUid) return { kind: "field", key: byColumnUid.key };

  return { kind: "ignore" };
}

function schemaRowTarget(
  row: SchemaSheetRow,
  descriptor: ImportEntityDescriptor,
  knownCustom: Set<string>,
): MappingTarget {
  if (row.customColumnId) {
    return knownCustom.has(row.customColumnId)
      ? { kind: "customField", columnId: row.customColumnId }
      : { kind: "ignore" };
  }

  return targetFromSchemaKey(row.key, descriptor);
}

function bindSchemaRows(sources: SourceColumn[], schemaRows: SchemaSheetRow[]): Map<number, SchemaSheetRow> {
  const bound = new Map<number, SchemaSheetRow>();
  const unplaced: SchemaSheetRow[] = [];

  for (const row of schemaRows) {
    const index = row.position - 1;
    const source = sources[index];

    if (source && !bound.has(index) && normalizeHeader(source.header) === normalizeHeader(row.header))
      bound.set(index, row);
    else unplaced.push(row);
  }

  for (const row of unplaced) {
    const candidates: number[] = [];

    sources.forEach((source, index) => {
      if (!bound.has(index) && normalizeHeader(source.header) === normalizeHeader(row.header)) candidates.push(index);
    });

    if (candidates.length === 1) bound.set(candidates[0], row);
  }

  return bound;
}

export function mappingFromSchemaSheet(
  sources: SourceColumn[],
  schemaRows: SchemaSheetRow[],
  descriptor: ImportEntityDescriptor,
  customColumns: CustomColumnDto[],
): MappingTarget[] | null {
  if (schemaRows.length === 0) return null;

  const knownCustom = new Set(customColumns.map((column) => column.id));
  const bound = bindSchemaRows(sources, schemaRows);

  const mapping: MappingTarget[] = sources.map((_, index) => {
    const row = bound.get(index);
    return row ? schemaRowTarget(row, descriptor, knownCustom) : { kind: "ignore" };
  });

  const taken = new Set(mapping.filter((target) => target.kind !== "ignore").map(targetIdentity));

  sources.forEach((source, index) => {
    if (mapping[index].kind === "ignore") mapping[index] = matchSource(source, descriptor, customColumns, taken);
  });

  return mapping;
}

type Candidate = { target: MappingTarget; score: number };

function fieldCandidates(normalized: string, descriptor: ImportEntityDescriptor): Candidate[] {
  const candidates: Candidate[] = [];

  if (RECORD_ID_SYNONYMS.includes(normalized)) candidates.push({ target: { kind: "recordId" }, score: 100 });

  for (const field of descriptor.fields) {
    const synonyms = FIELD_SYNONYMS[field.key] ?? [field.key.toLocaleLowerCase()];
    if (synonyms.includes(normalized)) candidates.push({ target: { kind: "field", key: field.key }, score: 100 });
  }

  return candidates;
}

function customCandidates(normalized: string, customColumns: CustomColumnDto[]): Candidate[] {
  const matches = customColumns.filter((column) => normalizeHeader(column.label) === normalized);
  if (matches.length !== 1) return [];

  return [{ target: { kind: "customField", columnId: matches[0].id }, score: 95 }];
}

function matchSource(
  source: SourceColumn,
  descriptor: ImportEntityDescriptor,
  customColumns: CustomColumnDto[],
  taken: Set<string>,
): MappingTarget {
  const normalized = normalizeHeader(source.header);
  if (normalized.length === 0) return { kind: "ignore" };

  const candidates = [...fieldCandidates(normalized, descriptor), ...customCandidates(normalized, customColumns)];
  const best = candidates.sort((a, b) => b.score - a.score)[0];

  if (!best || best.score < AUTO_MATCH_THRESHOLD) return { kind: "ignore" };

  const tied = candidates.filter((candidate) => candidate.score === best.score);
  if (tied.length > 1) return { kind: "ignore" };

  const identity = targetIdentity(best.target);
  if (taken.has(identity)) return { kind: "ignore" };
  taken.add(identity);

  return best.target;
}

export function autoMatchColumns(
  sources: SourceColumn[],
  descriptor: ImportEntityDescriptor,
  customColumns: CustomColumnDto[],
): MappingTarget[] {
  const taken = new Set<string>();

  return sources.map((source) => matchSource(source, descriptor, customColumns, taken));
}

export function targetIdentity(target: MappingTarget): string {
  switch (target.kind) {
    case "ignore":
      return "ignore";
    case "recordId":
      return "recordId";
    case "field":
      return `field:${target.key}`;
    case "customField":
      return `custom:${target.columnId}`;
    case "identifier":
      return `${IDENTIFIER_TARGET_PREFIX}${target.provider}`;
  }
}

export function duplicateTargets(mapping: MappingTarget[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const target of mapping) {
    if (target.kind === "ignore") continue;

    const identity = targetIdentity(target);
    if (seen.has(identity)) duplicates.add(identity);
    seen.add(identity);
  }

  return [...duplicates];
}
