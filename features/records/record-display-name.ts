import type { CalculatedValue } from "./record-model.schema";

type Translate = (key: string, values?: Record<string, string>) => string;

export function recordDisplayName(title: CalculatedValue | undefined, singular: string | undefined, t: Translate) {
  if (title?.state === "restricted") return t("RecordModel.restricted");
  if (title?.state === "error") return t("RecordModel.calculationError");
  if (title?.state === "value" && title.value.kind === "text" && title.value.value.trim()) return title.value.value;
  return t("RecordModel.untitledRecord", { singular: singular ?? t("RecordModel.record") });
}
