import type { RecordFieldView, RecordModelView } from "@/features/records/record-model.schema";

import { isRecordFieldWritable } from "@/features/records/record-input-value";

type XlsxTarget =
  | { kind: "skip" }
  | { kind: "recordId" }
  | { kind: "assignedTo" }
  | { kind: "field"; fieldId: string }
  | { kind: "rangePart"; fieldId: string; part: "start" | "end" }
  | { kind: "nameParts"; firstFieldId: string; lastFieldId: string }
  | { kind: "relationship"; relationId: string; targetTypeId: string };

export type XlsxTargetOption = { key: string; label: string; target: XlsxTarget };

export const XLSX_SKIP_KEY = "skip";

export type XlsxTargetLabels = { recordId: string; assignedTo: string; rangeStart: string; rangeEnd: string };

const FIRST_NAME_WORDS = ["firstname", "givenname", "vorname", "prenom", "nombre", "nome"];

const LAST_NAME_WORDS = ["lastname", "surname", "familyname", "nachname", "nom", "apellido", "cognome"];

const FULL_NAME_WORDS = ["fullname", "vollstandigername", "nomcomplet", "nombrecompleto", "nomecompleto"];

const PERSON_NAME_WORDS = ["name", ...FULL_NAME_WORDS];

const SYNONYM_GROUPS: string[][] = [
  ["amount", "price", "value", "betrag", "preis", "montant", "importe", "prezzo"],
  FIRST_NAME_WORDS,
  LAST_NAME_WORDS,
  ["name", "title", "companyname", "accountname", "dealname", "firmenname", "titel", "titre", "titolo", "titulo"],
  ["notes", "note", "description", "comments", "notizen", "beschreibung", "descripcion", "descrizione"],
  ["contacts", "kontakte", "contactos", "contatti", "people", "personen"],
  ["deals", "opportunities", "abschlusse", "oportunidades", "affaires", "trattative"],
  ["organizations", "organisations", "companies", "accounts", "organisationen", "firmen", "empresas", "aziende"],
  ["services", "products", "leistungen", "servicios", "servizi", "produkte"],
  ["tasks", "todos", "aufgaben", "tareas", "attivita", "taches"],
  ["email", "emailaddress", "mail", "emailadresse", "correo", "courriel"],
  ["phone", "phonenumber", "telephone", "telefon", "telefono", "mobile", "handy"],
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

function inGroup(group: string[], normalized: string): boolean {
  return group.some((word) => sameWord(word, normalized));
}

function synonymMatch(header: string, label: string): boolean {
  return SYNONYM_GROUPS.some((group) => inGroup(group, header) && inGroup(group, label));
}

export function xlsxImportFields(model: RecordModelView, typeId: string): RecordFieldView[] {
  return model.fields
    .filter((field) => field.typeId === typeId && !field.archived && isRecordFieldWritable(field))
    .sort((left, right) => left.position - right.position);
}

export function xlsxTargetOptions(
  model: RecordModelView,
  typeId: string,
  labels: XlsxTargetLabels,
): XlsxTargetOption[] {
  const parent = model.types.find((type) => type.id === typeId)?.parentRelationshipId ?? null;
  const writable = xlsxImportFields(model, typeId);
  const fields = writable.flatMap<XlsxTargetOption>((field) => [
    { key: `field:${field.id}`, label: field.label, target: { kind: "field", fieldId: field.id } },
    ...(field.valueType === "dateRange" || field.valueType === "dateTimeRange"
      ? (["start", "end"] as const).map<XlsxTargetOption>((part) => ({
          key: `field:${field.id}:${part}`,
          label: `${field.label} (${part === "start" ? labels.rangeStart : labels.rangeEnd})`,
          target: { kind: "rangePart", fieldId: field.id, part },
        }))
      : []),
  ]);
  const textFields = writable.filter((field) => field.valueType === "text" && !field.multiple);
  const namedField = (words: string[]) =>
    textFields.find((field) => words.some((word) => sameWord(word, normalizeXlsxHeader(field.label))));
  const first = namedField(FIRST_NAME_WORDS);
  const last = namedField(LAST_NAME_WORDS);
  const nameParts: XlsxTargetOption[] =
    first && last && first.id !== last.id
      ? [
          {
            key: `nameParts:${first.id}:${last.id}`,
            label: `${first.label} + ${last.label}`,
            target: { kind: "nameParts", firstFieldId: first.id, lastFieldId: last.id },
          },
        ]
      : [];
  const relationships = model.relationships
    .filter((relation) => !relation.archived && relation.id !== parent && relation.sourceTypeId === typeId)
    .map<XlsxTargetOption>((relation) => ({
      key: `relationship:${relation.id}`,
      label: relation.sourceLabel,
      target: { kind: "relationship", relationId: relation.id, targetTypeId: relation.targetTypeId },
    }));
  return [
    ...fields,
    ...nameParts,
    ...relationships,
    { key: "assignedTo", label: labels.assignedTo, target: { kind: "assignedTo" } },
    { key: "recordId", label: labels.recordId, target: { kind: "recordId" } },
  ];
}

function matchScore(header: string, option: XlsxTargetOption): number {
  const label = normalizeXlsxHeader(option.label);
  if (option.target.kind === "recordId" && RECORD_ID_SYNONYMS.includes(header)) return 100;
  if (option.target.kind === "assignedTo" && ASSIGNED_SYNONYMS.some((word) => sameWord(word, header))) return 95;
  if (option.target.kind === "nameParts") return inGroup(PERSON_NAME_WORDS, header) ? 85 : 0;
  if (label && sameWord(label, header)) return 100;
  if (label && inGroup(PERSON_NAME_WORDS, header) && inGroup(PERSON_NAME_WORDS, label)) return 90;
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
    const list = candidates[index].filter(
      (candidate) => !writtenTargets(candidate.option.key).some((key) => taken.has(key)),
    );
    const best = list[0];
    if (!best) continue;
    if (list.filter((candidate) => candidate.score === best.score).length > 1) continue;
    for (const key of writtenTargets(best.option.key)) taken.add(key);
    result[index] = best.option.key;
  }
  return result;
}

function writtenTargets(key: string): string[] {
  const [kind, firstFieldId, lastFieldId] = key.split(":");
  return kind === "nameParts" && firstFieldId && lastFieldId
    ? [`field:${firstFieldId}`, `field:${lastFieldId}`]
    : [key];
}

export function duplicateXlsxTargets(mapping: string[]): string[] {
  const keys = mapping.filter((key) => key !== XLSX_SKIP_KEY);
  const counts = new Map<string, number>();
  for (const target of keys.flatMap(writtenTargets)) counts.set(target, (counts.get(target) ?? 0) + 1);
  return [...new Set(keys.filter((key) => writtenTargets(key).some((target) => (counts.get(target) ?? 0) > 1)))];
}
