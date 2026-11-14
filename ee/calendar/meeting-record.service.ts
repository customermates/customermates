import { randomUUID } from "node:crypto";

import type { GetRecordInteractor } from "@/features/records/get-record.interactor";
import type { GetRecordModelInteractor } from "@/features/records/get-record-model.interactor";
import type { MutateRecordInteractor } from "@/features/records/mutate-record.interactor";
import type { RecordIdentityReader } from "@/features/records/record-identity-reader";
import type {
  CalculatedValue,
  RecordDto,
  RecordFieldView,
  RecordModelView,
  RecordRef,
  RecordScalarInput,
} from "@/features/records/record-model.schema";

import { recordChannelsEnabled } from "@/features/records/record-channels";
import { zonedDate } from "@/features/record-calendar/zoned-time";

import type { MeetingActionList, MeetingActionTarget, MeetingAttendeeSuggestion } from "./meeting.schema";

const EMAIL_PROVIDERS = new Set(["mail", "google", "outlook"]);
const LINKED_RECORD_READ_LIMIT = 20;
const SELECTABLE_ANSWER_TYPES = new Set(["text", "url", "select", "number", "boolean", "date"]);

export type RecordPorts = {
  model: Pick<GetRecordModelInteractor, "invoke">;
  read: Pick<GetRecordInteractor, "invoke">;
  mutate: Pick<MutateRecordInteractor, "invoke">;
  identities: Pick<RecordIdentityReader, "resolve">;
};

export type AnswerValue = string | number | boolean;

export function isAnswerableField(field: RecordFieldView): boolean {
  return (
    !field.archived &&
    field.behavior.kind === "input" &&
    !field.multiple &&
    SELECTABLE_ANSWER_TYPES.has(field.valueType)
  );
}

function titleText(title: CalculatedValue | undefined): string | null {
  return title?.state === "value" && title.value.kind === "text" && title.value.value.trim()
    ? title.value.value.trim()
    : null;
}

function emailOf(identity: { provider: string; value: string }): string | null {
  return EMAIL_PROVIDERS.has(identity.provider) && identity.value.includes("@") ? identity.value.toLowerCase() : null;
}

export function answerScalar(field: RecordFieldView, answer: AnswerValue): RecordScalarInput | null {
  switch (field.valueType) {
    case "text":
    case "url":
      return typeof answer === "string" && answer.trim() ? { kind: "text", value: answer.trim() } : null;
    case "select":
      return typeof answer === "string" && field.options.some((option) => option.id === answer)
        ? { kind: "select", value: answer }
        : null;
    case "number":
      return typeof answer === "number" && Number.isFinite(answer)
        ? { kind: "decimal", value: String(answer), currency: null }
        : null;
    case "boolean":
      return typeof answer === "boolean" ? { kind: "boolean", value: answer } : null;
    case "date":
      return typeof answer === "string" && /^\d{4}-\d{2}-\d{2}$/.test(answer) ? { kind: "date", value: answer } : null;
    default:
      return null;
  }
}

function linkBetween(model: RecordModelView, typeId: string, ref: RecordRef) {
  for (const relationship of model.relationships) {
    if (relationship.archived) continue;
    if (relationship.sourceTypeId === typeId && relationship.targetTypeId === ref.typeId)
      return { relationId: relationship.id, direction: "outgoing" as const, record: ref };
    if (relationship.sourceTypeId === ref.typeId && relationship.targetTypeId === typeId)
      return { relationId: relationship.id, direction: "incoming" as const, record: ref };
  }
  return null;
}

export class MeetingRecordService {
  constructor(private ports: RecordPorts) {}

  async loadModel(): Promise<RecordModelView | null> {
    const result = await this.ports.model.invoke({});
    return result.ok ? result.data : null;
  }

  async canRead(refs: RecordRef[]): Promise<boolean> {
    for (const ref of refs) {
      const result = await this.ports.read.invoke({ typeId: ref.typeId, recordId: ref.recordId });
      if (!result.ok) return false;
    }
    return true;
  }

  async suggestAttendees(ref: RecordRef, model: RecordModelView): Promise<MeetingAttendeeSuggestion[]> {
    const relationships = model.relationships
      .filter((relationship) => !relationship.archived)
      .flatMap((relationship) => [
        ...(relationship.sourceTypeId === ref.typeId
          ? [{ relationId: relationship.id, direction: "outgoing" as const, limit: 25 }]
          : []),
        ...(relationship.targetTypeId === ref.typeId
          ? [{ relationId: relationship.id, direction: "incoming" as const, limit: 25 }]
          : []),
      ])
      .slice(0, 32);
    const read = await this.ports.read.invoke({
      typeId: ref.typeId,
      recordId: ref.recordId,
      ...(relationships.length ? { includeRelationships: relationships } : {}),
    });
    if (!read.ok) return [];

    const suggestions = new Map<string, MeetingAttendeeSuggestion>();
    const add = (record: RecordDto, ownRef: RecordRef, name: string | null) => {
      for (const identity of record.identities ?? []) {
        const email = emailOf(identity);
        if (email && !suggestions.has(email))
          suggestions.set(email, { email, name: identity.displayName ?? name, ref: ownRef });
      }
    };
    const primary = model.types.find((type) => type.id === ref.typeId)?.primaryFieldId;
    add(read.data, ref, titleText(read.data.fields.find((field) => field.fieldId === primary)?.result));

    const linked = read.data.relationships
      .flatMap((summary) => summary.records)
      .filter((item) => recordChannelsEnabled(model, item.ref.typeId))
      .slice(0, LINKED_RECORD_READ_LIMIT);
    for (const item of linked) {
      const record = await this.ports.read.invoke({ typeId: item.ref.typeId, recordId: item.ref.recordId });
      if (record.ok) add(record.data, item.ref, titleText(item.title));
    }
    return [...suggestions.values()];
  }

  actionLists(model: RecordModelView): MeetingActionList[] {
    return model.types
      .filter((type) => !type.archived && !type.embedded)
      .flatMap((type) => {
        const dateFields = model.fields
          .filter(
            (field) =>
              field.typeId === type.id &&
              !field.archived &&
              field.behavior.kind === "input" &&
              !field.multiple &&
              (field.valueType === "date" || field.valueType === "dateTime"),
          )
          .map((field) => ({
            id: field.id,
            label: field.label,
            valueType: field.valueType as "date" | "dateTime",
          }));
        if (!dateFields.length || !type.primaryFieldId) return [];
        const linkableTypeIds = model.relationships
          .filter((relationship) => !relationship.archived)
          .flatMap((relationship) =>
            relationship.sourceTypeId === type.id
              ? [relationship.targetTypeId]
              : relationship.targetTypeId === type.id
                ? [relationship.sourceTypeId]
                : [],
          );
        return [{ typeId: type.id, label: type.label, dateFields, linkableTypeIds: [...new Set(linkableTypeIds)] }];
      });
  }

  async createAction(input: {
    target: MeetingActionTarget;
    title: string;
    startsAt: Date;
    timeZone: string;
    links: RecordRef[];
  }): Promise<RecordRef | null> {
    const model = await this.loadModel();
    const type = model?.types.find((item) => item.id === input.target.typeId && !item.archived);
    const date = model?.fields.find(
      (field) => field.id === input.target.dateFieldId && field.typeId === input.target.typeId && !field.archived,
    );
    if (!model || !type?.primaryFieldId || !date) return null;

    const dateValue: RecordScalarInput | null =
      date.valueType === "dateTime"
        ? { kind: "dateTime", value: input.startsAt.toISOString() }
        : date.valueType === "date"
          ? {
              kind: "date",
              value: zonedDate(input.startsAt, input.timeZone),
            }
          : null;
    if (!dateValue) return null;

    return this.create(
      model,
      input.target.typeId,
      [
        { fieldId: type.primaryFieldId, value: { kind: "text", value: input.title } },
        { fieldId: date.id, value: dateValue },
      ],
      input.links,
    );
  }

  async findOrCreatePerson(input: { typeId: string; email: string; name: string }): Promise<RecordRef | null> {
    const existing = await this.findPerson(input.typeId, input.email);
    if (existing) return existing;

    const model = await this.loadModel();
    const type = model?.types.find((item) => item.id === input.typeId && !item.archived);
    if (!model || !type?.primaryFieldId || !recordChannelsEnabled(model, type.id)) return null;

    const created = await this.create(
      model,
      type.id,
      [{ fieldId: type.primaryFieldId, value: { kind: "text", value: input.name } }],
      [],
      [{ provider: "mail", value: input.email, displayName: input.name }],
    );

    return created ?? (await this.findPerson(input.typeId, input.email));
  }

  async createBookingRecord(input: {
    typeId: string;
    title: string;
    startFieldId: string | null;
    startsAt: Date;
    timeZone: string;
    answers: Array<{ fieldId: string; value: AnswerValue }>;
    links: RecordRef[];
  }): Promise<RecordRef | null> {
    const model = await this.loadModel();
    const type = model?.types.find((item) => item.id === input.typeId && !item.archived);
    if (!model || !type?.primaryFieldId) return null;

    const fields: Array<{ fieldId: string; value: RecordScalarInput }> = [
      { fieldId: type.primaryFieldId, value: { kind: "text", value: input.title } },
    ];
    const start = input.startFieldId
      ? model.fields.find((field) => field.id === input.startFieldId && field.typeId === type.id && !field.archived)
      : null;
    if (start?.valueType === "dateTime")
      fields.push({ fieldId: start.id, value: { kind: "dateTime", value: input.startsAt.toISOString() } });
    if (start?.valueType === "date") {
      fields.push({
        fieldId: start.id,
        value: { kind: "date", value: zonedDate(input.startsAt, input.timeZone) },
      });
    }
    for (const answer of input.answers) {
      const field = model.fields.find((item) => item.id === answer.fieldId && item.typeId === type.id);
      const value = field && isAnswerableField(field) ? answerScalar(field, answer.value) : null;
      if (field && value && !fields.some((entry) => entry.fieldId === field.id))
        fields.push({ fieldId: field.id, value });
    }

    return this.create(model, type.id, fields, input.links);
  }

  private async findPerson(typeId: string, email: string): Promise<RecordRef | null> {
    const matches = await this.ports.identities.resolve([{ provider: "mail", value: email }], [typeId]);
    return matches.flatMap((match) => match.records)[0]?.ref ?? null;
  }

  private async create(
    model: RecordModelView,
    typeId: string,
    fields: Array<{ fieldId: string; value: RecordScalarInput }>,
    linkTo: RecordRef[],
    identities?: Array<{ provider: "mail"; value: string; displayName: string }>,
  ): Promise<RecordRef | null> {
    const links = linkTo.flatMap((ref) => {
      const link = linkBetween(model, typeId, ref);
      return link ? [link] : [];
    });
    const result = await this.ports.mutate.invoke({
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId,
        fields,
        ...(links.length ? { links } : {}),
        ...(identities ? { identities } : {}),
      },
    });
    return result.ok && result.data.status === "completed" ? (result.data.refs[0] ?? null) : null;
  }
}
