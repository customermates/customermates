import type { useTranslations } from "next-intl";
import type { CalculatedValue } from "@/features/records/record-model.schema";

type Translate = ReturnType<typeof useTranslations>;

export function recordTitle(title: CalculatedValue | undefined, singular: string | undefined, t: Translate) {
  if (title?.state === "restricted") return t("RecordModel.restricted");
  if (title?.state === "error") return t("RecordModel.calculationError");
  if (title?.state === "value" && title.value.kind === "text" && title.value.value.trim()) return title.value.value;
  return t("RecordModel.untitledRecord", { singular: singular ?? t("RecordModel.record") });
}
