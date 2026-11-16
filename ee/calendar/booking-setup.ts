import type { RecordModelView } from "@/features/records/record-model.schema";

import { recordChannelsEnabled } from "@/features/records/record-channels";
import { isAnswerableField } from "@/features/records/record-value-coercion";

import type { MeetingOptions, WritableCalendar } from "./meeting.schema";

export type BookingSetupRelationship = {
  id: string;
  sourceTypeId: string;
  targetTypeId: string;
  sourceLabel: string;
  targetLabel: string;
};

export type BookingSetupList = {
  id: string;
  label: string;
  hasChannels: boolean;
  primaryFieldId: string | null;
  dateFields: Array<{ id: string; label: string }>;
  questionFields: Array<{ id: string; label: string }>;
};

export type BookingSetup = {
  calendars: WritableCalendar[];
  lists: BookingSetupList[];
  relationships: BookingSetupRelationship[];
  blockedReason: MeetingOptions["blockedReason"];
};

export function bookingSetup(model: RecordModelView | null, meeting: MeetingOptions): BookingSetup {
  const lists = (model?.types ?? [])
    .filter((type) => !type.archived && !type.embedded)
    .map((type) => {
      const fields = model?.fields.filter((field) => field.typeId === type.id && !field.archived) ?? [];

      return {
        id: type.id,
        label: type.label,
        hasChannels: model ? recordChannelsEnabled(model, type.id) : false,
        primaryFieldId: type.primaryFieldId,
        dateFields: fields
          .filter(
            (field) =>
              field.behavior.kind === "input" &&
              !field.multiple &&
              (field.valueType === "date" || field.valueType === "dateTime"),
          )
          .map((field) => ({ id: field.id, label: field.label })),
        questionFields: fields
          .filter((field) => field.id !== type.primaryFieldId && isAnswerableField(field))
          .map((field) => ({ id: field.id, label: field.label })),
      };
    });

  const relationships = (model?.relationships ?? [])
    .filter((relation) => !relation.archived)
    .map(({ id, sourceTypeId, targetTypeId, sourceLabel, targetLabel }) => ({
      id,
      sourceTypeId,
      targetTypeId,
      sourceLabel,
      targetLabel,
    }));

  return { calendars: meeting.calendars, lists, relationships, blockedReason: meeting.blockedReason };
}
