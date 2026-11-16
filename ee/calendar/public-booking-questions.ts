import type { RecordModelView } from "@/features/records/record-model.schema";

import { answerQuestion, isAnswerableField } from "@/features/records/record-value-coercion";

import type { BookingLinkRow, PublicQuestion } from "./booking.schema";

import { storedQuestions } from "./booking-link-dto";

export function publicQuestions(model: RecordModelView | null, link: BookingLinkRow): PublicQuestion[] {
  if (!model || !link.recordTypeId) return [];

  return storedQuestions(link.questions).flatMap((question) => {
    const field = model.fields.find((item) => item.id === question.fieldId && item.typeId === link.recordTypeId);
    const result =
      field && isAnswerableField(field)
        ? answerQuestion(field, { label: question.label ?? field.label, helpText: null, required: question.required })
        : null;

    return result ? [result] : [];
  });
}
