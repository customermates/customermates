import type { RecordModelView } from "@/features/records/record-model.schema";

import type { BookingLinkRow, PublicQuestion } from "./booking.schema";

import { storedQuestions } from "./booking-link-dto";
import { isAnswerableField } from "./meeting-record.service";

const KINDS: Record<string, PublicQuestion["kind"]> = {
  text: "text",
  url: "url",
  select: "select",
  number: "number",
  boolean: "boolean",
  date: "date",
};

export function publicQuestions(model: RecordModelView | null, link: BookingLinkRow): PublicQuestion[] {
  if (!model || !link.recordTypeId) return [];

  return storedQuestions(link.questions).flatMap((question) => {
    const field = model.fields.find((item) => item.id === question.fieldId && item.typeId === link.recordTypeId);
    const kind = field ? KINDS[field.valueType] : undefined;
    if (!field || !kind || !isAnswerableField(field)) return [];

    return [
      {
        fieldId: field.id,
        label: question.label ?? field.label,
        kind,
        required: question.required,
        options: field.valueType === "select" ? field.options.map(({ id, label }) => ({ id, label })) : [],
      },
    ];
  });
}
