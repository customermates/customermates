import type { RecordModelView } from "@/features/records/record-model.schema";

import { recordChannelsEnabled } from "@/features/records/record-channels";

import type { BookingQuestion } from "./booking.schema";

import { isAnswerableField } from "./meeting-record.service";

type ListChoice = {
  personTypeId: string | null;
  recordTypeId: string | null;
  startFieldId: string | null;
  questions: BookingQuestion[];
};

export function invalidBookingList(model: RecordModelView, choice: ListChoice): Array<string | number> | null {
  const live = (typeId: string) => model.types.find((type) => type.id === typeId && !type.archived && !type.embedded);

  if (choice.personTypeId) {
    const person = live(choice.personTypeId);
    if (!person || !recordChannelsEnabled(model, person.id)) return ["personTypeId"];
  }

  const recordType = choice.recordTypeId ? live(choice.recordTypeId) : null;
  if (choice.recordTypeId && !recordType?.primaryFieldId) return ["recordTypeId"];

  if (choice.startFieldId) {
    const field = model.fields.find((item) => item.id === choice.startFieldId);
    const usable =
      recordType &&
      field &&
      field.typeId === recordType.id &&
      !field.archived &&
      field.behavior.kind === "input" &&
      !field.multiple &&
      (field.valueType === "date" || field.valueType === "dateTime");
    if (!usable) return ["startFieldId"];
  }

  for (const [index, question] of choice.questions.entries()) {
    const field = model.fields.find((item) => item.id === question.fieldId);
    const usable =
      recordType &&
      field &&
      field.typeId === recordType.id &&
      field.id !== recordType.primaryFieldId &&
      field.id !== choice.startFieldId &&
      isAnswerableField(field);
    if (!usable) return ["questions", index, "fieldId"];
  }

  return null;
}
