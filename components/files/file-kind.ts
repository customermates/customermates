import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  type LucideIcon,
  Presentation,
} from "lucide-react";

export const FILE_KINDS = [
  "pdf",
  "spreadsheet",
  "csv",
  "document",
  "presentation",
  "json",
  "markdown",
  "html",
  "text",
  "image",
  "audio",
  "video",
  "archive",
  "other",
] as const;
type FileKind = (typeof FILE_KINDS)[number];

const KIND_BY_MIME_TYPE: Record<string, FileKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "spreadsheet",
  "application/vnd.ms-excel": "spreadsheet",
  "application/vnd.oasis.opendocument.spreadsheet": "spreadsheet",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/tab-separated-values": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/msword": "document",
  "application/vnd.oasis.opendocument.text": "document",
  "application/rtf": "document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "presentation",
  "application/vnd.ms-powerpoint": "presentation",
  "application/json": "json",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/html": "html",
  "application/xhtml+xml": "html",
  "text/plain": "text",
  "application/zip": "archive",
  "application/x-tar": "archive",
  "application/gzip": "archive",
  "application/x-7z-compressed": "archive",
};

const KIND_BY_EXTENSION: Record<string, FileKind> = {
  pdf: "pdf",
  xlsx: "spreadsheet",
  xls: "spreadsheet",
  ods: "spreadsheet",
  numbers: "spreadsheet",
  csv: "csv",
  tsv: "csv",
  docx: "document",
  doc: "document",
  odt: "document",
  rtf: "document",
  pages: "document",
  pptx: "presentation",
  ppt: "presentation",
  key: "presentation",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  txt: "text",
  log: "text",
  zip: "archive",
  tar: "archive",
  gz: "archive",
  "7z": "archive",
};

function fileExtension(name: string | null | undefined): string {
  return /\.([a-z0-9]+)$/iu.exec(name?.trim() ?? "")?.[1]?.toLowerCase() ?? "";
}

export function fileKind(mimeType: string | null | undefined, name?: string | null): FileKind {
  const type = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  const byType = KIND_BY_MIME_TYPE[type];
  if (byType && byType !== "text") return byType;
  if (type.endsWith("+json")) return "json";
  const byExtension = KIND_BY_EXTENSION[fileExtension(name)];
  if (byExtension) return byExtension;
  if (byType) return byType;
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("text/")) return "text";
  if (type.includes("compressed")) return "archive";
  return "other";
}

const LABEL_KEY: Record<FileKind, string> = {
  pdf: "FileTypes.pdf",
  spreadsheet: "FileTypes.spreadsheet",
  csv: "FileTypes.csv",
  document: "FileTypes.document",
  presentation: "FileTypes.presentation",
  json: "FileTypes.json",
  markdown: "FileTypes.markdown",
  html: "FileTypes.html",
  text: "FileTypes.text",
  image: "FileTypes.image",
  audio: "FileTypes.audio",
  video: "FileTypes.video",
  archive: "FileTypes.archive",
  other: "FileTypes.other",
};

export function fileTypeLabelKey(kind: FileKind): string {
  return LABEL_KEY[kind];
}

const SHORT_LABEL: Partial<Record<FileKind, string>> = {
  pdf: "PDF",
  spreadsheet: "XLS",
  csv: "CSV",
  document: "DOC",
  presentation: "PPT",
  json: "JSON",
  markdown: "MD",
  html: "HTML",
  text: "TXT",
  archive: "ZIP",
};

export function fileBadgeText(kind: FileKind, name?: string | null): string {
  const extension = fileExtension(name).toUpperCase();
  if (extension && extension.length <= 4 && kind !== "other") return extension;
  return SHORT_LABEL[kind] ?? (extension && extension.length <= 4 ? extension : "");
}

export const FILE_KIND_TONE_CLASS: Record<FileKind, string> = {
  pdf: "bg-destructive/15 text-destructive",
  spreadsheet: "bg-success/15 text-success",
  csv: "bg-chart-2/15 text-chart-2",
  document: "bg-info/15 text-info",
  presentation: "bg-warning/15 text-warning",
  json: "bg-warning/15 text-warning",
  markdown: "bg-primary/15 text-primary",
  html: "bg-foreground/5 text-muted-foreground",
  text: "bg-foreground/5 text-muted-foreground",
  image: "bg-foreground/5 text-muted-foreground",
  audio: "bg-foreground/5 text-muted-foreground",
  video: "bg-foreground/5 text-muted-foreground",
  archive: "bg-foreground/5 text-muted-foreground",
  other: "bg-foreground/5 text-muted-foreground",
};

export const FILE_KIND_ICON: Record<FileKind, LucideIcon> = {
  pdf: FileText,
  spreadsheet: FileSpreadsheet,
  csv: FileSpreadsheet,
  document: FileText,
  presentation: Presentation,
  json: FileCode,
  markdown: FileText,
  html: FileCode,
  text: FileText,
  image: FileImage,
  audio: FileAudio,
  video: FileVideo,
  archive: FileArchive,
  other: FileIcon,
};

export function fileKindAccentClass(kind: FileKind): string {
  return FILE_KIND_TONE_CLASS[kind].split(" ").find((part) => part.startsWith("text-")) ?? "text-muted-foreground";
}
