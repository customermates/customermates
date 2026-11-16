import { describe, expect, it } from "vitest";

import type { RecordModelView } from "@/features/records/record-model.schema";

import { bookingSetup } from "../booking-setup";
import { invalidBookingList } from "../booking-link-validation";

const PEOPLE = "10000000-0000-4000-8000-000000000001";
const ACTIONS = "10000000-0000-4000-8000-000000000002";
const NAME = "20000000-0000-4000-8000-000000000001";
const CHANNELS = "20000000-0000-4000-8000-000000000002";
const TITLE = "20000000-0000-4000-8000-000000000003";
const DUE = "20000000-0000-4000-8000-000000000004";
const NOTE = "20000000-0000-4000-8000-000000000005";
const SUM = "20000000-0000-4000-8000-000000000006";

function field(id: string, typeId: string, valueType: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    typeId,
    label: `field ${id.slice(-1)}`,
    valueType,
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position: 0,
    ...extra,
  };
}

function type(id: string, primaryFieldId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    label: id === PEOPLE ? "People" : "Actions",
    pluralLabel: "x",
    description: "",
    icon: "",
    primaryFieldId,
    parentRelationshipId: null,
    embedded: false,
    navigationVisible: true,
    archived: false,
    position: 0,
    ...extra,
  };
}

const MODEL = {
  revision: 1,
  types: [type(PEOPLE, NAME), type(ACTIONS, TITLE)],
  fields: [
    field(NAME, PEOPLE, "text"),
    field(CHANNELS, PEOPLE, "channels"),
    field(TITLE, ACTIONS, "text"),
    field(DUE, ACTIONS, "dateTime"),
    field(NOTE, ACTIONS, "text"),
    field(SUM, ACTIONS, "number", { behavior: { kind: "formula" } }),
  ],
  relationships: [],
  accessPresets: [],
  capabilities: [],
} as unknown as RecordModelView;

const PERSON_RELATION = "30000000-0000-4000-8000-000000000001";
const MODEL_WITH_RELATION = {
  ...MODEL,
  relationships: [{ id: PERSON_RELATION, sourceTypeId: ACTIONS, targetTypeId: PEOPLE, archived: false }],
} as unknown as RecordModelView;

const NONE = {
  personTypeId: null,
  personRelationshipId: null,
  recordTypeId: null,
  startFieldId: null,
  questions: [],
};

describe("invalidBookingList", () => {
  it("accepts an unconfigured link and a complete configuration", () => {
    expect(invalidBookingList(MODEL, NONE)).toBeNull();
    expect(
      invalidBookingList(MODEL, {
        personTypeId: PEOPLE,
        personRelationshipId: null,
        recordTypeId: ACTIONS,
        startFieldId: DUE,
        questions: [{ fieldId: NOTE, required: true }],
      }),
    ).toBeNull();
  });

  it("requires a list with contact details for the visitor", () => {
    expect(invalidBookingList(MODEL, { ...NONE, personTypeId: ACTIONS })).toEqual(["personTypeId"]);
  });

  it("accepts a relationship that joins the person list and the booking list", () => {
    expect(
      invalidBookingList(MODEL_WITH_RELATION, {
        ...NONE,
        personTypeId: PEOPLE,
        recordTypeId: ACTIONS,
        personRelationshipId: PERSON_RELATION,
      }),
    ).toBeNull();
  });

  it("refuses a relationship that is unknown, archived, or without both lists", () => {
    const both = { ...NONE, personTypeId: PEOPLE, recordTypeId: ACTIONS };
    const archived = {
      ...MODEL_WITH_RELATION,
      relationships: [{ id: PERSON_RELATION, sourceTypeId: ACTIONS, targetTypeId: PEOPLE, archived: true }],
    } as unknown as RecordModelView;

    expect(invalidBookingList(MODEL_WITH_RELATION, { ...both, personRelationshipId: "missing" })).toEqual([
      "personRelationshipId",
    ]);
    expect(invalidBookingList(archived, { ...both, personRelationshipId: PERSON_RELATION })).toEqual([
      "personRelationshipId",
    ]);
    expect(
      invalidBookingList(MODEL_WITH_RELATION, { ...NONE, recordTypeId: ACTIONS, personRelationshipId: PERSON_RELATION }),
    ).toEqual(["personRelationshipId"]);
    expect(
      invalidBookingList(MODEL_WITH_RELATION, { ...NONE, personTypeId: PEOPLE, personRelationshipId: PERSON_RELATION }),
    ).toEqual(["personRelationshipId"]);
  });

  it("refuses a start field or question outside the booking list, the title field and calculated fields", () => {
    const base = { ...NONE, recordTypeId: ACTIONS };

    expect(invalidBookingList(MODEL, { ...base, startFieldId: NAME })).toEqual(["startFieldId"]);
    expect(invalidBookingList(MODEL, { ...base, startFieldId: NOTE })).toEqual(["startFieldId"]);
    expect(invalidBookingList(MODEL, { ...base, questions: [{ fieldId: NAME, required: false }] })).toEqual([
      "questions",
      0,
      "fieldId",
    ]);
    expect(invalidBookingList(MODEL, { ...base, questions: [{ fieldId: TITLE, required: false }] })).toEqual([
      "questions",
      0,
      "fieldId",
    ]);
    expect(invalidBookingList(MODEL, { ...base, questions: [{ fieldId: SUM, required: false }] })).toEqual([
      "questions",
      0,
      "fieldId",
    ]);
  });

  it("refuses questions without a booking list", () => {
    expect(invalidBookingList(MODEL, { ...NONE, questions: [{ fieldId: NOTE, required: false }] })).toEqual([
      "questions",
      0,
      "fieldId",
    ]);
  });
});

describe("bookingSetup", () => {
  it("offers lists with their contact capability, date fields and answerable fields", () => {
    const setup = bookingSetup(MODEL, { calendars: [], attendees: [], actionLists: [], blockedReason: "noCalendar" });
    const actions = setup.lists.find((list) => list.id === ACTIONS);

    expect(setup.blockedReason).toBe("noCalendar");
    expect(setup.lists.find((list) => list.id === PEOPLE)?.hasChannels).toBe(true);
    expect(actions?.hasChannels).toBe(false);
    expect(actions?.dateFields.map((item) => item.id)).toEqual([DUE]);
    expect(actions?.questionFields.map((item) => item.id)).toEqual([NOTE]);
    expect(setup.relationships).toEqual([]);
  });

  it("offers the live relationships to choose the link between the two lists", () => {
    const setup = bookingSetup(MODEL_WITH_RELATION, {
      calendars: [],
      attendees: [],
      actionLists: [],
      blockedReason: "noCalendar",
    });

    expect(setup.relationships).toEqual([
      expect.objectContaining({ id: PERSON_RELATION, sourceTypeId: ACTIONS, targetTypeId: PEOPLE }),
    ]);
  });
});
