import type {
  CalculatedValue,
  RecordDto,
  RecordField,
  RecordMember,
  RecordModel,
  RecordRelationship,
  RecordScalar,
} from "@/features/records/record-model.schema";

import { PassThrough } from "node:stream";

export const SPREADSHEET_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const DATE_NUMBER_FORMAT = "yyyy-mm-dd";
export const DATE_TIME_NUMBER_FORMAT = "yyyy-mm-dd hh:mm";

const LIST_SEPARATOR = ", ";
const SHEET_NAME_LIMIT = 31;
const INVALID_SHEET_NAME = /[[\]:*?/\\]/g;
const BLOCK_NODES = new Set([
  "paragraph",
  "heading",
  "listItem",
  "taskItem",
  "blockquote",
  "codeBlock",
  "tableRow",
  "horizontalRule",
]);

type RecordWorkbookCell =
  | string
  | number
  | boolean
  | Date
  | null
  | { value: number; numFmt: string }
  | { value: Date; numFmt: string };

type RecordWorkbookColumn = { header: string; numFmt?: string; hidden?: boolean };

type RecordWorkbookSheet = { name: string; columns: RecordWorkbookColumn[]; rows: RecordWorkbookCell[][] };

type RecordWorkbookLabels = {
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  recordId: string;
};

type ColumnSpec = RecordWorkbookColumn & {
  cell: (record: RecordDto) => RecordWorkbookCell;
  restricted?: (record: RecordDto) => boolean;
};

export function neutralizeFormula(value: string): string {
  return value.startsWith("=") ? `'${value}` : value;
}

function text(value: string | null | undefined): RecordWorkbookCell {
  if (value === null || value === undefined || value === "") return null;
  return neutralizeFormula(value);
}

function joined(values: string[]): RecordWorkbookCell {
  return text(values.filter((value) => value.length > 0).join(LIST_SEPARATOR));
}

function memberName(member: Pick<RecordMember, "firstName" | "lastName">): string {
  return `${member.firstName} ${member.lastName}`.trim();
}

function utcDate(value: string): Date | null {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function decimalFormat(field: RecordField, currency: string | null): string | undefined {
  const places = field.format?.decimalPlaces;
  const base =
    places === null || places === undefined
      ? currency
        ? "#,##0.00"
        : undefined
      : places > 0
        ? `#,##0.${"0".repeat(places)}`
        : "#,##0";
  if (!currency) return base;
  return `${base} "${currency}"`;
}

type RichTextNode = { type?: unknown; text?: unknown; content?: unknown };

function richTextLines(node: RichTextNode, lines: string[]): void {
  if (node.type === "text" && typeof node.text === "string") {
    lines[lines.length - 1] += node.text;
    return;
  }
  if (node.type === "hardBreak") {
    lines.push("");
    return;
  }
  const block = typeof node.type === "string" && BLOCK_NODES.has(node.type);
  if (block && lines[lines.length - 1] !== "") lines.push("");
  if (Array.isArray(node.content)) for (const child of node.content) richTextLines(child as RichTextNode, lines);
  if (block && lines[lines.length - 1] !== "") lines.push("");
}

export function richTextToPlainText(documentJson: string): string {
  try {
    const lines = [""];
    richTextLines(JSON.parse(documentJson) as RichTextNode, lines);
    return lines
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
  } catch {
    return "";
  }
}

function scalarCell(
  value: RecordScalar,
  field: RecordField,
  record: RecordDto,
  part?: "start" | "end",
): RecordWorkbookCell {
  switch (value.kind) {
    case "text":
      return text(value.value);
    case "textList":
      return joined(value.value);
    case "decimal": {
      const number = Number(value.value);
      if (!Number.isFinite(number)) return text(value.value);
      const numFmt = decimalFormat(field, value.currency);
      return numFmt ? { value: number, numFmt } : number;
    }
    case "boolean":
      return value.value;
    case "date":
    case "dateTime": {
      const date = utcDate(value.value);
      if (!date) return text(value.value);
      return value.kind === "date" || /^\d{4}-\d{2}-\d{2}$/.test(value.value)
        ? { value: date, numFmt: DATE_NUMBER_FORMAT }
        : { value: date, numFmt: DATE_TIME_NUMBER_FORMAT };
    }
    case "range": {
      const bound = part === "end" ? value.end : value.start;
      if (!bound) return null;
      const date = utcDate(bound);
      if (!date) return text(bound);
      return {
        value: date,
        numFmt: field.valueType === "dateRange" ? DATE_NUMBER_FORMAT : DATE_TIME_NUMBER_FORMAT,
      };
    }
    case "select":
      return text(field.options.find((option) => option.id === value.value)?.label ?? value.value);
    case "selectList":
      return joined(value.value.map((id) => field.options.find((option) => option.id === id)?.label ?? id));
    case "member": {
      const member = record.memberUsers.find((user) => user.id === value.value);
      return member ? text(memberName(member)) : null;
    }
    case "richText":
      return text(richTextToPlainText(value.documentJson));
  }
}

function resultCell(
  result: CalculatedValue | undefined,
  field: RecordField,
  record: RecordDto,
  part?: "start" | "end",
): RecordWorkbookCell {
  return result?.state === "value" ? scalarCell(result.value, field, record, part) : null;
}

function columnFormat(field: RecordField): string | undefined {
  switch (field.valueType) {
    case "date":
      return DATE_NUMBER_FORMAT;
    case "dateTime":
      return DATE_TIME_NUMBER_FORMAT;
    case "currency":
    case "number":
      return decimalFormat(field, field.valueType === "currency" ? (field.format?.currency ?? null) : null);
    default:
      return undefined;
  }
}

function fieldColumns(field: RecordField, labels: RecordWorkbookLabels): ColumnSpec[] {
  const result = (record: RecordDto) => record.fields.find((value) => value.fieldId === field.id)?.result;
  const restricted = (record: RecordDto) => result(record)?.state === "restricted";
  if (field.valueType === "channels") {
    return [
      {
        header: field.label,
        cell: (record) => joined((record.identities ?? []).map((identity) => identity.value)),
      },
    ];
  }
  if (field.valueType === "dateRange" || field.valueType === "dateTimeRange") {
    const numFmt = field.valueType === "dateRange" ? DATE_NUMBER_FORMAT : DATE_TIME_NUMBER_FORMAT;
    return (["start", "end"] as const).map((part) => ({
      header: `${field.label} (${part === "start" ? labels.rangeStart : labels.rangeEnd})`,
      numFmt,
      restricted,
      cell: (record: RecordDto) => resultCell(result(record), field, record, part),
    }));
  }
  const currency = field.valueType === "currency" ? field.format?.currency : null;
  return [
    {
      header: currency ? `${field.label} (${currency})` : field.label,
      numFmt: columnFormat(field),
      restricted,
      cell: (record) => resultCell(result(record), field, record),
    },
  ];
}

function relationshipColumn(relation: RecordRelationship, direction: "outgoing" | "incoming"): ColumnSpec {
  return {
    header: direction === "outgoing" ? relation.sourceLabel : relation.targetLabel,
    cell: (record) =>
      joined(
        (
          record.relationships.find((summary) => summary.relationId === relation.id && summary.direction === direction)
            ?.records ?? []
        ).flatMap(({ title }) => (title.state === "value" && title.value.kind === "text" ? [title.value.value] : [])),
      ),
  };
}

export function recordWorkbookRelationships(model: RecordModel, typeId: string, canReadType: (id: string) => boolean) {
  const active = new Set(model.types.filter((type) => !type.archived).map((type) => type.id));
  return model.relationships.flatMap((relation) => {
    if (relation.archived || !active.has(relation.sourceTypeId) || !active.has(relation.targetTypeId)) return [];
    return (["outgoing", "incoming"] as const).flatMap((direction) => {
      const own = direction === "outgoing" ? relation.sourceTypeId : relation.targetTypeId;
      const other = direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
      return own === typeId && canReadType(other) ? [{ relation, direction }] : [];
    });
  });
}

function uniqueSheetName(label: string, used: Set<string>): string {
  const base =
    label.replace(INVALID_SHEET_NAME, " ").replace(/\s+/g, " ").trim().slice(0, SHEET_NAME_LIMIT).trim() || "Sheet";
  let name = base;
  for (let suffix = 2; used.has(name.toLowerCase()); suffix += 1)
    name = `${base.slice(0, SHEET_NAME_LIMIT - String(suffix).length - 1)} ${suffix}`;
  used.add(name.toLowerCase());
  return name;
}

export function recordWorkbookSheets(
  model: RecordModel,
  rootTypeId: string,
  records: RecordDto[],
  labels: RecordWorkbookLabels,
  canReadType: (id: string) => boolean = () => true,
): RecordWorkbookSheet[] {
  const typeIds = [
    rootTypeId,
    ...new Set(records.map((record) => record.ref.typeId).filter((id) => id !== rootTypeId)),
  ];
  const used = new Set<string>();
  return typeIds.flatMap((typeId) => {
    const type = model.types.find((candidate) => candidate.id === typeId);
    if (!type) return [];
    const rows = records.filter((record) => record.ref.typeId === typeId);
    const fields = model.fields
      .filter((field) => field.typeId === typeId && !field.archived)
      .sort((left, right) => left.position - right.position);
    const candidates: ColumnSpec[] = [
      ...fields.flatMap((field) => fieldColumns(field, labels)),
      ...recordWorkbookRelationships(model, typeId, canReadType).map(({ relation, direction }) =>
        relationshipColumn(relation, direction),
      ),
      {
        header: labels.assignedTo,
        cell: (record) => joined(record.assignedUsers.map(memberName)),
      },
      {
        header: labels.createdAt,
        numFmt: DATE_TIME_NUMBER_FORMAT,
        cell: (record) => utcDate(record.createdAt),
      },
      {
        header: labels.updatedAt,
        numFmt: DATE_TIME_NUMBER_FORMAT,
        cell: (record) => utcDate(record.updatedAt),
      },
      { header: labels.recordId, hidden: true, cell: (record) => record.ref.recordId },
    ];
    const columns = candidates.filter(
      (column) => !(rows.length > 0 && column.restricted && rows.every(column.restricted)),
    );
    return [
      {
        name: uniqueSheetName(type.pluralLabel, used),
        columns: columns.map(({ header, numFmt, hidden }) => ({
          header,
          ...(numFmt ? { numFmt } : {}),
          ...(hidden ? { hidden } : {}),
        })),
        rows: rows.map((record) => columns.map((column) => column.cell(record))),
      },
    ];
  });
}

function collect(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export async function writeRecordWorkbook(sheets: RecordWorkbookSheet[]): Promise<Buffer> {
  const ExcelJS = await import("exceljs");
  const stream = new PassThrough();
  const collected = collect(stream);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true, useSharedStrings: false });
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name, { views: [{ state: "frozen", ySplit: 1 }] });
    worksheet.columns = sheet.columns.map((column) => ({
      header: column.header,
      width: column.hidden ? 38 : Math.min(Math.max(column.header.length + 2, 14), 48),
      hidden: column.hidden,
      style: column.numFmt ? { numFmt: column.numFmt } : {},
    }));
    worksheet.getRow(1).font = { bold: true };
    for (const cells of sheet.rows) {
      const row = worksheet.addRow(
        cells.map((cell) => (cell !== null && typeof cell === "object" && !(cell instanceof Date) ? cell.value : cell)),
      );
      cells.forEach((cell, index) => {
        if (cell !== null && typeof cell === "object" && !(cell instanceof Date))
          row.getCell(index + 1).numFmt = cell.numFmt;
      });
      row.commit();
    }
    worksheet.commit();
  }
  await workbook.commit();
  return collected;
}
