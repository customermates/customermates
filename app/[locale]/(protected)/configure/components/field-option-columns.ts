import type { RecordField, RecordScalar } from "@/features/records/record-model.schema";

import { arrayMove } from "@dnd-kit/sortable";

import { PROBABILITY_ATTRIBUTE } from "@/features/records/calculation-sentence";
export const OPTION_ATTRIBUTE_TYPES = ["number", "text", "boolean"] as const;

export type OptionAttributeType = (typeof OPTION_ATTRIBUTE_TYPES)[number] | "preserved";
export type OptionAttributeColumn = { id: string; key: string; type: OptionAttributeType };
export type OptionCell = string | RecordScalar;
export type OptionDraft = {
  id: string;
  label: string;
  color: string | null;
  cells: Record<string, OptionCell>;
};

function attributeType(values: RecordScalar[]): OptionAttributeType {
  if (values.every((value) => value.kind === "decimal" && !value.currency)) return "number";
  if (values.every((value) => value.kind === "text")) return "text";
  if (values.every((value) => value.kind === "boolean")) return "boolean";
  return "preserved";
}

function cellOf(type: OptionAttributeType, value: RecordScalar): OptionCell {
  if (type === "preserved") return value;
  if (value.kind === "boolean") return String(value.value);
  return value.kind === "decimal" || value.kind === "text" ? value.value : value;
}

function scalarOf(type: OptionAttributeType, cell: OptionCell | undefined): RecordScalar | null {
  if (cell === undefined || cell === "") return null;
  if (typeof cell !== "string") return cell;
  if (type === "number") return { kind: "decimal", value: cell.trim().replace(",", "."), currency: null };
  if (type === "boolean") return { kind: "boolean", value: cell === "true" };
  return { kind: "text", value: cell };
}

function loadedColumnId(key: string) {
  return `attribute-${[...key].map((character) => character.codePointAt(0)?.toString(36)).join("-")}`;
}

export function optionColumnsFromField(options: RecordField["options"]) {
  const keys = [...new Set(options.flatMap((option) => option.attributes.map((attribute) => attribute.key)))].sort(
    (left, right) => Number(right === PROBABILITY_ATTRIBUTE) - Number(left === PROBABILITY_ATTRIBUTE),
  );
  const columns: OptionAttributeColumn[] = keys.map((key) => ({
    id: loadedColumnId(key),
    key,
    type: attributeType(
      options.flatMap((option) =>
        option.attributes.filter((attribute) => attribute.key === key).map((attribute) => attribute.value),
      ),
    ),
  }));
  const drafts: OptionDraft[] = options.map((option) => ({
    id: option.id,
    label: option.label,
    color: option.color,
    cells: Object.fromEntries(
      columns.flatMap((column) => {
        const attribute = option.attributes.find((candidate) => candidate.key === column.key);
        return attribute ? [[column.id, cellOf(column.type, attribute.value)]] : [];
      }),
    ),
  }));
  return { columns, options: drafts };
}

export function optionsWithAttributes(
  columns: OptionAttributeColumn[],
  options: OptionDraft[],
): RecordField["options"] {
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    color: option.color,
    attributes: columns.flatMap((column) => {
      const value = scalarOf(column.type, option.cells[column.id]);
      return value ? [{ key: column.key, value }] : [];
    }),
  }));
}

export function moveOption(options: OptionDraft[], activeId: string, overId: string) {
  const ids = options.map((option) => option.id);
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  return from < 0 || to < 0 ? options : arrayMove(options, from, to);
}

export function attributeKeyTaken(columns: OptionAttributeColumn[], key: string, exceptId?: string) {
  const normalized = key.trim().toLowerCase();
  return columns.some((column) => column.id !== exceptId && column.key.trim().toLowerCase() === normalized);
}
