export type RecordFileTextFormat = "pdf" | "docx" | "xlsx" | "html" | "json" | "csv" | "markdown" | "text";

const FORMAT_BY_MIME_TYPE: Record<string, RecordFileTextFormat> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/html": "html",
  "application/xhtml+xml": "html",
  "application/json": "json",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/tab-separated-values": "csv",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/plain": "text",
};

const FORMAT_BY_EXTENSION: Record<string, RecordFileTextFormat> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  html: "html",
  htm: "html",
  json: "json",
  csv: "csv",
  tsv: "csv",
  md: "markdown",
  markdown: "markdown",
  txt: "text",
};

export function recordFileTextFormat(mimeType: string, name: string): RecordFileTextFormat | null {
  const type = mimeType.split(";")[0].trim().toLowerCase();
  const known = FORMAT_BY_MIME_TYPE[type] ?? (type.endsWith("+json") ? "json" : undefined);
  if (known) return known;
  const extension = /\.([a-z0-9]+)$/iu.exec(name.trim())?.[1]?.toLowerCase();
  return extension ? (FORMAT_BY_EXTENSION[extension] ?? null) : null;
}
