import { describe, expect, it, vi } from "vitest";

import type { RecordModelView } from "@/features/records/record-model.schema";

import { MeetingRecordService, type RecordPorts } from "../meeting-record.service";

const PEOPLE = "10000000-0000-4000-8000-000000000001";
const DEALS = "10000000-0000-4000-8000-000000000002";
const ACTIONS = "10000000-0000-4000-8000-000000000003";
const NAME = "20000000-0000-4000-8000-000000000001";
const CHANNELS = "20000000-0000-4000-8000-000000000002";
const TITLE = "20000000-0000-4000-8000-000000000003";
const DUE = "20000000-0000-4000-8000-000000000004";
const DEAL_NAME = "20000000-0000-4000-8000-000000000005";
const ACTION_LINK_TO_DEAL = "30000000-0000-4000-8000-000000000001";
const DEAL_PEOPLE = "30000000-0000-4000-8000-000000000002";
const DEAL = { typeId: DEALS, recordId: "40000000-0000-4000-8000-000000000001" };
const ADA = { typeId: PEOPLE, recordId: "40000000-0000-4000-8000-000000000002" };

function field(id: string, typeId: string, valueType: string) {
  return {
    id,
    typeId,
    label: valueType,
    valueType,
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position: 0,
  };
}

function type(id: string, primaryFieldId: string) {
  return {
    id,
    label: id,
    pluralLabel: id,
    description: "",
    icon: "",
    primaryFieldId,
    parentRelationshipId: null,
    embedded: false,
    navigationVisible: true,
    archived: false,
    position: 0,
  };
}

function relationship(id: string, sourceTypeId: string, targetTypeId: string) {
  return { id, sourceTypeId, targetTypeId, archived: false };
}

const MODEL = {
  revision: 7,
  types: [type(PEOPLE, NAME), type(DEALS, DEAL_NAME), type(ACTIONS, TITLE)],
  fields: [
    field(NAME, PEOPLE, "text"),
    field(CHANNELS, PEOPLE, "channels"),
    field(DEAL_NAME, DEALS, "text"),
    field(TITLE, ACTIONS, "text"),
    field(DUE, ACTIONS, "dateTime"),
  ],
  relationships: [
    relationship(ACTION_LINK_TO_DEAL, ACTIONS, DEALS),
    relationship(DEAL_PEOPLE, DEALS, PEOPLE),
  ],
  accessPresets: [],
  capabilities: [],
} as unknown as RecordModelView;

function ports(overrides: Partial<Record<keyof RecordPorts, unknown>> = {}) {
  const mutate = vi.fn().mockResolvedValue({ ok: true, data: { status: "completed", refs: [ADA] } });
  const all = {
    model: { invoke: vi.fn().mockResolvedValue({ ok: true, data: MODEL }) },
    read: { invoke: vi.fn().mockResolvedValue({ ok: false }) },
    mutate: { invoke: mutate },
    identities: { resolve: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
  return { all: all as unknown as RecordPorts, mutate };
}

describe("MeetingRecordService.createAction", () => {
  it("creates a record in the chosen list with the title, the start and a link to the record", async () => {
    const { all, mutate } = ports();

    const created = await new MeetingRecordService(all).createAction({
      target: { typeId: ACTIONS, dateFieldId: DUE },
      title: "Intro call",
      startsAt: new Date("2026-11-17T09:00:00.000Z"),
      timeZone: "Europe/Berlin",
      links: [DEAL],
    });

    expect(created).toEqual(ADA);
    expect(mutate).toHaveBeenCalledWith({
      expectedRevision: 7,
      idempotencyKey: expect.any(String),
      mutation: {
        action: "create",
        typeId: ACTIONS,
        fields: [
          { fieldId: TITLE, value: { kind: "text", value: "Intro call" } },
          { fieldId: DUE, value: { kind: "dateTime", value: "2026-11-17T09:00:00.000Z" } },
        ],
        links: [{ relationId: ACTION_LINK_TO_DEAL, direction: "outgoing", record: DEAL }],
      },
    });
  });

  it("writes only the local date into a date field and skips links without a relationship", async () => {
    const dateModel = {
      ...MODEL,
      fields: MODEL.fields.map((item) => (item.id === DUE ? { ...item, valueType: "date" } : item)),
    };
    const { all, mutate } = ports({ model: { invoke: vi.fn().mockResolvedValue({ ok: true, data: dateModel }) } });

    await new MeetingRecordService(all).createAction({
      target: { typeId: ACTIONS, dateFieldId: DUE },
      title: "Late call",
      startsAt: new Date("2026-11-17T23:30:00.000Z"),
      timeZone: "Europe/Berlin",
      links: [ADA],
    });

    const mutation = mutate.mock.calls[0][0].mutation;
    expect(mutation.fields[1]).toEqual({ fieldId: DUE, value: { kind: "date", value: "2026-11-18" } });
    expect(mutation.links).toBeUndefined();
  });

  it("returns null for an unknown list or date field and when the write fails", async () => {
    const { all, mutate } = ports();
    const service = new MeetingRecordService(all);
    const base = { title: "x", startsAt: new Date(), timeZone: "UTC", links: [] };

    expect(await service.createAction({ ...base, target: { typeId: PEOPLE, dateFieldId: DUE } })).toBeNull();
    expect(await service.createAction({ ...base, target: { typeId: ACTIONS, dateFieldId: NAME } })).toBeNull();

    mutate.mockResolvedValueOnce({ ok: false });
    expect(await service.createAction({ ...base, target: { typeId: ACTIONS, dateFieldId: DUE } })).toBeNull();
  });
});

describe("MeetingRecordService.findOrCreatePerson", () => {
  it("returns the existing Person of that email without writing", async () => {
    const { all, mutate } = ports({
      identities: { resolve: vi.fn().mockResolvedValue([{ provider: "mail", value: "ada@example.com", records: [{ ref: ADA }] }]) },
    });

    const person = await new MeetingRecordService(all).findOrCreatePerson({
      typeId: PEOPLE,
      email: "ada@example.com",
      name: "Ada",
    });

    expect(person).toEqual(ADA);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("creates one Person with the name and the email as a contact identity", async () => {
    const { all, mutate } = ports();

    const person = await new MeetingRecordService(all).findOrCreatePerson({
      typeId: PEOPLE,
      email: "ada@example.com",
      name: "Ada Lovelace",
    });

    expect(person).toEqual(ADA);
    expect(mutate.mock.calls[0][0].mutation).toEqual({
      action: "create",
      typeId: PEOPLE,
      fields: [{ fieldId: NAME, value: { kind: "text", value: "Ada Lovelace" } }],
      identities: [{ provider: "mail", value: "ada@example.com", displayName: "Ada Lovelace" }],
    });
  });

  it("re-reads the Person when a concurrent booking created it first", async () => {
    const resolve = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ provider: "mail", value: "ada@example.com", records: [{ ref: ADA }] }]);
    const { all, mutate } = ports({ identities: { resolve } });
    mutate.mockResolvedValueOnce({ ok: false });

    const person = await new MeetingRecordService(all).findOrCreatePerson({
      typeId: PEOPLE,
      email: "ada@example.com",
      name: "Ada",
    });

    expect(person).toEqual(ADA);
  });

  it("does not create a Person in a list without contact details", async () => {
    const { all, mutate } = ports();

    expect(
      await new MeetingRecordService(all).findOrCreatePerson({ typeId: ACTIONS, email: "a@b.co", name: "A" }),
    ).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe("MeetingRecordService.createBookingRecord", () => {
  it("stores the title, the start and the valid answers, and drops answers the field cannot take", async () => {
    const NOTE = "20000000-0000-4000-8000-000000000009";
    const model = { ...MODEL, fields: [...MODEL.fields, field(NOTE, ACTIONS, "text")] } as unknown as RecordModelView;
    const { all, mutate } = ports({ model: { invoke: vi.fn().mockResolvedValue({ ok: true, data: model }) } });

    await new MeetingRecordService(all).createBookingRecord({
      typeId: ACTIONS,
      title: "Ada - Intro call",
      startFieldId: DUE,
      startsAt: new Date("2026-11-17T09:00:00.000Z"),
      timeZone: "Europe/Berlin",
      answers: [
        { fieldId: NOTE, value: "Pricing" },
        { fieldId: DUE, value: "ignored" },
        { fieldId: "20000000-0000-4000-8000-0000000000ff", value: "unknown" },
      ],
      links: [],
    });

    expect(mutate.mock.calls[0][0].mutation.fields).toEqual([
      { fieldId: TITLE, value: { kind: "text", value: "Ada - Intro call" } },
      { fieldId: DUE, value: { kind: "dateTime", value: "2026-11-17T09:00:00.000Z" } },
      { fieldId: NOTE, value: { kind: "text", value: "Pricing" } },
    ]);
  });
});

describe("MeetingRecordService.suggestAttendees", () => {
  it("offers the record's own email and the emails of linked People, once each", async () => {
    const read = vi.fn().mockImplementation(({ typeId, recordId }: { typeId: string; recordId: string }) => {
      if (typeId === DEALS)
        return Promise.resolve({
          ok: true,
          data: {
            fields: [],
            identities: [],
            relationships: [
              {
                relationId: DEAL_PEOPLE,
                direction: "outgoing",
                records: [{ ref: ADA, title: { state: "value", value: { kind: "text", value: "Ada" } } }],
              },
            ],
          },
        });
      return Promise.resolve({
        ok: true,
        data: {
          fields: [],
          identities: [
            { provider: "mail", value: "Ada@Example.com", displayName: null },
            { provider: "phone", value: "+4930123", displayName: null },
            { provider: "google", value: "ada@example.com", displayName: null },
          ],
          relationships: [],
        },
      });
    });
    const { all } = ports({ read: { invoke: read } });

    const suggestions = await new MeetingRecordService(all).suggestAttendees(DEAL, MODEL);

    expect(suggestions).toEqual([{ email: "ada@example.com", name: "Ada", ref: ADA }]);
    expect(read.mock.calls[0][0].includeRelationships).toEqual([
      { relationId: ACTION_LINK_TO_DEAL, direction: "incoming", limit: 25 },
      { relationId: DEAL_PEOPLE, direction: "outgoing", limit: 25 },
    ]);
  });

  it("offers nothing when the record cannot be read", async () => {
    const { all } = ports();

    expect(await new MeetingRecordService(all).suggestAttendees(DEAL, MODEL)).toEqual([]);
  });
});

describe("MeetingRecordService.actionLists", () => {
  it("lists lists with a date field and a title, and the lists they can link to", () => {
    const { all } = ports();

    const lists = new MeetingRecordService(all).actionLists(MODEL);

    expect(lists).toEqual([
      {
        typeId: ACTIONS,
        label: ACTIONS,
        dateFields: [{ id: DUE, label: "dateTime", valueType: "dateTime" }],
        linkableTypeIds: [DEALS],
      },
    ]);
  });
});
