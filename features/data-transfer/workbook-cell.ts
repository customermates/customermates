export type WorkbookCellValue = string | number | boolean | Date | null;

const INJECTION_PREFIXES = ["="];

const NEUTRALIZING_PREFIX = "'";

export function needsFormulaNeutralization(value: string): boolean {
  return INJECTION_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function neutralizeFormula(value: string): string {
  return needsFormulaNeutralization(value) ? `${NEUTRALIZING_PREFIX}${value}` : value;
}

export function denormalizeNeutralizedFormula(value: string): string {
  if (!value.startsWith(NEUTRALIZING_PREFIX)) return value;

  const remainder = value.slice(NEUTRALIZING_PREFIX.length);
  return needsFormulaNeutralization(remainder) ? remainder : value;
}

export function toWorkbookCell(value: WorkbookCellValue | undefined): WorkbookCellValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return neutralizeFormula(value);

  return value;
}

type RichTextRun = { text?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function fromWorkbookCell(raw: unknown): WorkbookCellValue {
  if (raw === undefined || raw === null) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return raw;
  if (typeof raw === "string") return denormalizeNeutralizedFormula(raw);

  if (!isRecord(raw)) return null;

  if ("error" in raw) return null;
  if ("result" in raw) return fromWorkbookCell(raw.result);
  if ("text" in raw && "hyperlink" in raw) return fromWorkbookCell(raw.text);

  if ("richText" in raw && Array.isArray(raw.richText)) {
    const joined = (raw.richText as RichTextRun[])
      .map((run) => (typeof run?.text === "string" ? run.text : ""))
      .join("");
    return denormalizeNeutralizedFormula(joined);
  }

  if ("formula" in raw) return null;

  return null;
}

export function fromWorkbookCellAsText(raw: unknown): string {
  const value = fromWorkbookCell(raw);
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString();

  return String(value);
}
