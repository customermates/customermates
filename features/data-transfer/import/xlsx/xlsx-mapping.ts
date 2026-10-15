import type { RecordFieldView, RecordModelView } from "@/features/records/record-model.schema";

import { isRecordFieldWritable } from "@/features/records/record-input-value";
import { recordChannelsEnabled, recordChannelsField } from "@/features/records/record-channels";

type XlsxTarget =
  | { kind: "skip" }
  | { kind: "recordId" }
  | { kind: "assignedTo" }
  | { kind: "field"; fieldId: string }
  | { kind: "rangePart"; fieldId: string; part: "start" | "end" }
  | { kind: "relationship"; relationId: string; targetTypeId: string }
  | { kind: "channels" };

export type XlsxTargetOption = { key: string; label: string; target: XlsxTarget };

export const XLSX_SKIP_KEY = "skip";

export const XLSX_CHANNELS_KEY = "channels";

export type XlsxTargetLabels = { recordId: string; assignedTo: string; rangeStart: string; rangeEnd: string };

const PHONE_SYNONYMS = [
  "phone",
  "phonenumber",
  "telephone",
  "telefon",
  "telefonnummer",
  "telefono",
  "mobile",
  "mobil",
  "mobilnummer",
  "handy",
  "cellphone",
  "cellulare",
  "movil",
];

const SYNONYM_GROUPS: string[][] = [
  ["amount", "price", "value", "betrag", "preis", "montant", "importe", "prezzo"],
  ["firstname", "givenname", "vorname", "prenom", "nombre", "nome"],
  ["lastname", "surname", "familyname", "nachname", "nom", "apellido", "cognome"],
  ["name", "title", "companyname", "accountname", "dealname", "firmenname", "titel", "titre", "titolo", "titulo"],
  ["notes", "note", "description", "comments", "notizen", "beschreibung", "descripcion", "descrizione"],
  ["contacts", "kontakte", "contactos", "contatti", "people", "personen"],
  ["deals", "opportunities", "abschlusse", "oportunidades", "affaires", "trattative"],
  ["organizations", "organisations", "companies", "accounts", "organisationen", "firmen", "empresas", "aziende"],
  ["services", "products", "leistungen", "servicios", "servizi", "produkte"],
  ["tasks", "todos", "aufgaben", "tareas", "attivita", "taches"],
  ["email", "emailaddress", "mail", "emailadresse", "correo", "courriel"],
  PHONE_SYNONYMS,
  ["website", "url", "homepage", "webseite", "sitioweb", "siteweb", "sitoweb"],
  ["stage", "phase", "status", "etape", "etapa", "fase"],
];

const ASSIGNED_SYNONYMS = [
  "assigned",
  "assignedto",
  "owner",
  "assignee",
  "zugewiesen",
  "verantwortlich",
  "asignado",
  "assigne",
  "assegnato",
];

const RECORD_ID_SYNONYMS = ["id", "recordid", "customermatesid"];

export function normalizeXlsxHeader(header: string): string {
  return header
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function singular(normalized: string): string {
  if (normalized.length > 4 && normalized.endsWith("ies")) return `${normalized.slice(0, -3)}y`;
  return normalized.length > 3 && normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;
}

function sameWord(left: string, right: string): boolean {
  return left === right || singular(left) === singular(right);
}

function synonymMatch(header: string, label: string): boolean {
  return SYNONYM_GROUPS.some(
    (group) => group.some((word) => sameWord(word, header)) && group.some((word) => sameWord(word, label)),
  );
}

export function xlsxImportFields(model: RecordModelView, typeId: string): RecordFieldView[] {
  return model.fields
    .filter(
      (field) =>
        field.typeId === typeId && !field.archived && field.valueType !== "file" && isRecordFieldWritable(field),
    )
    .sort((left, right) => left.position - right.position);
}

export function xlsxTargetOptions(
  model: RecordModelView,
  typeId: string,
  labels: XlsxTargetLabels,
): XlsxTargetOption[] {
  const parent = model.types.find((type) => type.id === typeId)?.parentRelationshipId ?? null;
  const fields = xlsxImportFields(model, typeId).flatMap<XlsxTargetOption>((field) => [
    { key: `field:${field.id}`, label: field.label, target: { kind: "field", fieldId: field.id } },
    ...(field.valueType === "dateRange" || field.valueType === "dateTimeRange"
      ? (["start", "end"] as const).map<XlsxTargetOption>((part) => ({
          key: `field:${field.id}:${part}`,
          label: `${field.label} (${part === "start" ? labels.rangeStart : labels.rangeEnd})`,
          target: { kind: "rangePart", fieldId: field.id, part },
        }))
      : []),
  ]);
  const relationships = model.relationships
    .filter((relation) => !relation.archived && relation.id !== parent && relation.sourceTypeId === typeId)
    .map<XlsxTargetOption>((relation) => ({
      key: `relationship:${relation.id}`,
      label: relation.sourceLabel,
      target: { kind: "relationship", relationId: relation.id, targetTypeId: relation.targetTypeId },
    }));
  const channels = recordChannelsEnabled(model, typeId) ? recordChannelsField(model, typeId) : undefined;
  return [
    ...fields,
    ...(channels ? [{ key: XLSX_CHANNELS_KEY, label: channels.label, target: { kind: "channels" as const } }] : []),
    ...relationships,
    { key: "assignedTo", label: labels.assignedTo, target: { kind: "assignedTo" } },
    { key: "recordId", label: labels.recordId, target: { kind: "recordId" } },
  ];
}

function matchScore(header: string, option: XlsxTargetOption): number {
  if (option.target.kind === "channels") return PHONE_SYNONYMS.some((word) => sameWord(word, header)) ? 90 : 0;
  const label = normalizeXlsxHeader(option.label);
  if (option.target.kind === "recordId" && RECORD_ID_SYNONYMS.includes(header)) return 100;
  if (option.target.kind === "assignedTo" && ASSIGNED_SYNONYMS.some((word) => sameWord(word, header))) return 95;
  if (label && sameWord(label, header)) return 100;
  if (label && synonymMatch(header, label)) return 80;
  return 0;
}

export function autoMapXlsxColumns(headers: string[], options: XlsxTargetOption[]): string[] {
  const taken = new Set<string>();
  const candidates = headers.map((header) => {
    const normalized = normalizeXlsxHeader(header);
    if (!normalized) return [];
    const base = normalizeXlsxHeader(header.replace(/\s*\([^()]*\)\s*$/, ""));
    return options
      .map((option) => ({
        option,
        score: Math.max(matchScore(normalized, option), base && base !== normalized ? matchScore(base, option) - 5 : 0),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score);
  });
  const result = headers.map(() => XLSX_SKIP_KEY);
  const order = candidates
    .map((list, index) => ({ index, best: list[0]?.score ?? 0 }))
    .sort((left, right) => right.best - left.best || left.index - right.index);
  for (const { index } of order) {
    const list = candidates[index].filter((candidate) => !taken.has(candidate.option.key));
    const best = list[0];
    if (!best) continue;
    if (list.filter((candidate) => candidate.score === best.score).length > 1) continue;
    if (best.option.key !== XLSX_CHANNELS_KEY) taken.add(best.option.key);
    result[index] = best.option.key;
  }
  return result;
}

export function duplicateXlsxTargets(mapping: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of mapping) {
    if (key === XLSX_SKIP_KEY || key === XLSX_CHANNELS_KEY) continue;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}
