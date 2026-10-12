import type { ChipColor } from "@/constants/chip-colors";
import type { DateDisplayFormat } from "@/constants/date-format";
import type { RecordFieldView } from "@/features/records/record-model.schema";

type ColumnField = Pick<RecordFieldView, "id" | "label">;

type CustomColumnOption = {
  value: string;
  label: string;
  color: ChipColor;
  isDefault: boolean;
  index: number;
  weight?: number;
};

type ChipColumnOptions = { color: ChipColor; allowMultiple: boolean };

export type CustomColumnDto = ColumnField &
  (
    | { type: "plain" }
    | {
        type: "date" | "dateTime" | "dateRange" | "dateTimeRange";
        options?: { displayFormat: DateDisplayFormat } | null;
      }
    | { type: "link" | "email" | "phone"; options: ChipColumnOptions }
    | { type: "currency"; options: { currency: string } }
    | { type: "singleSelect"; options: { options: CustomColumnOption[] } }
  );

export type ColumnPresentation<T = CustomColumnDto> =
  | T
  | { id: string; label: string; type: "number" | "member" | "boolean" }
  | { id: string; label: string; type: "recordReference"; typeId: string };
