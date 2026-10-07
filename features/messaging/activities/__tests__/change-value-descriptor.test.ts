import { describe, expect, it } from "vitest";

import {
  auditValueDescriptor,
  membersDescriptor,
  recordsDescriptor,
  recordValueDescriptor,
  type ChangeValueLabels,
} from "../change-value-descriptor";

const labels: ChangeValueLabels = {
  userStatus: (code) => `t:Common.userStatuses.${code}`,
  provider: (code) => `t:Common.providers.${code}`,
  removalReason: (code) => `t:AccountRemovalReason.${code}`,
  legalDocument: (code) => `t:LegalDocumentNotice.documents.${code}`,
  wikiKind: (code) => `t:Wiki.kind.${code}`,
  event: (code) => `t:Common.events.${code}`,
  country: (code) => `country:${code}`,
  currency: (code) => `currency:${code}`,
  date: (value) => `date:${value}`,
  grant: (action) => `grant:${action}`,
  resource: (code) => `resource:${code}`,
  formerMember: "Member",
};
const MEMBER = {
  id: "00000000-0000-4000-8000-000000000001",
  firstName: "Elena",
  lastName: "Hoffmann",
  avatarUrl: null,
};

function side(valueType: string, value: unknown, options: unknown[] = []) {
  return {
    fieldId: "00000000-0000-4000-8000-0000000000f1",
    label: "Field",
    valueType,
    format: null,
    options,
    value,
  } as never;
}

describe("audit value descriptors", () => {
  it.each([
    [
      "status",
      "active",
      { kind: "choices", choices: [{ id: "active", label: "t:Common.userStatuses.active", color: "success" }] },
    ],
    [
      "status",
      "inactive",
      { kind: "choices", choices: [{ id: "inactive", label: "t:Common.userStatuses.inactive", color: "destructive" }] },
    ],
    ["country", "de", { kind: "choices", choices: [{ id: "de", label: "country:de" }] }],
    ["currency", "EUR", { kind: "choices", choices: [{ id: "EUR", label: "currency:EUR" }] }],
    ["role", "Sales Manager", { kind: "choices", choices: [{ id: "Sales Manager", label: "Sales Manager" }] }],
    ["provider", "gmail", { kind: "choices", choices: [{ id: "gmail", label: "t:Common.providers.gmail" }] }],
    [
      "events",
      ["record.created", "record.updated"],
      {
        kind: "choices",
        choices: [
          { id: "record.created", label: "t:Common.events.record.created" },
          { id: "record.updated", label: "t:Common.events.record.updated" },
        ],
      },
    ],
    [
      "grants",
      ["readAll", "update"],
      {
        kind: "choices",
        choices: [
          { id: "readAll", label: "grant:readAll" },
          { id: "update", label: "grant:update" },
        ],
      },
    ],
  ])("renders %s %j as chips", (key, value, expected) => {
    expect(auditValueDescriptor(key, value, labels)).toEqual(expected);
  });

  it("renders routine trigger events, owners and role permissions with the shared renderers", () => {
    expect(auditValueDescriptor("triggerEvents", ["record.updated"], labels)).toEqual({
      kind: "choices",
      choices: [{ id: "record.updated", label: "t:Common.events.record.updated" }],
    });
    expect(
      auditValueDescriptor(
        "owner",
        { id: MEMBER.id, firstName: "Elena", lastName: "Hoffmann", avatarUrl: null },
        labels,
      ),
    ).toEqual({
      kind: "members",
      members: [MEMBER],
    });
    expect(auditValueDescriptor("permissions", [{ id: "p1", resource: "users", action: "readAll" }], labels)).toEqual({
      kind: "choices",
      choices: [{ id: "users:readAll", label: "resource:users · grant:readAll" }],
    });
  });

  it("renders members as avatar chips and identifiers as provider chips", () => {
    expect(auditValueDescriptor("users", [MEMBER], labels)).toEqual({ kind: "members", members: [MEMBER] });
    expect(auditValueDescriptor("identifiers", [{ provider: "gmail", value: "elena@example.test" }], labels)).toEqual({
      kind: "choices",
      choices: [{ id: "gmail:elena@example.test", label: "elena@example.test", provider: "gmail" }],
    });
  });

  it("renders scalars through the record value types", () => {
    expect(auditValueDescriptor("enabled", false, labels)).toMatchObject({
      kind: "field",
      field: { valueType: "boolean" },
      result: { state: "value", value: { kind: "boolean", value: false } },
    });
    expect(auditValueDescriptor("debounceSeconds", 30, labels)).toMatchObject({
      field: { valueType: "number" },
      result: { value: { kind: "decimal", value: "30", currency: null } },
    });
    expect(auditValueDescriptor("effectiveAt", "2026-10-01", labels)).toMatchObject({
      field: { valueType: "date" },
      result: { value: { kind: "date", value: "2026-10-01" } },
    });
    expect(auditValueDescriptor("sentAt", "2026-10-01T09:30:00.000Z", labels)).toMatchObject({
      field: { valueType: "dateTime" },
      result: { value: { kind: "dateTime" } },
    });
    expect(auditValueDescriptor("url", "https://receiver.example", labels)).toMatchObject({
      field: { valueType: "text" },
      result: { value: { kind: "text", value: "https://receiver.example" } },
    });
  });

  it("renders empty values, rich text, wiki kinds and unknown structures", () => {
    for (const empty of [null, undefined, "", []])
      expect(auditValueDescriptor("name", empty, labels)).toEqual({ kind: "empty" });
    expect(auditValueDescriptor("markdown", "## Guide", labels)).toEqual({ kind: "richText", markdown: "## Guide" });
    expect(auditValueDescriptor("kind", "procedure", labels, { isWikiEvent: true })).toEqual({
      kind: "choices",
      choices: [{ id: "procedure", label: "t:Wiki.kind.procedure" }],
    });
    expect(auditValueDescriptor("headers", { tenant: { a: 1 } }, labels)).toEqual({
      kind: "structured",
      value: { tenant: { a: 1 } },
    });
  });
});

describe("record value descriptors", () => {
  it("renders select, money and dates through the record field renderer with the field's options", () => {
    const options = [{ id: "open", label: "Open", color: "info" }];
    expect(
      recordValueDescriptor(
        side("select", { state: "value", value: { kind: "select", value: "open" } }, options),
        "type-1",
        [],
        "Member",
      ),
    ).toMatchObject({
      kind: "field",
      field: { valueType: "select", options, typeId: "type-1" },
    });
    expect(
      recordValueDescriptor(
        side("currency", { state: "value", value: { kind: "decimal", value: "12", currency: "EUR" } }),
        "type-1",
        [],
        "Member",
      ),
    ).toMatchObject({ kind: "field", field: { valueType: "currency" } });
  });

  it("renders a member value as an avatar chip and a missing value as empty", () => {
    expect(
      recordValueDescriptor(
        side("member", { state: "value", value: { kind: "member", value: MEMBER.id } }),
        "t",
        [MEMBER],
        "Member",
      ),
    ).toEqual({
      kind: "members",
      members: [MEMBER],
    });
    expect(recordValueDescriptor(null, "t", [], "Member")).toEqual({ kind: "empty" });
    expect(recordValueDescriptor(side("text", { state: "missing" }), "t", [], "Member")).toEqual({ kind: "empty" });
    expect(
      recordValueDescriptor(
        side("member", { state: "value", value: { kind: "member", value: "gone" } }),
        "t",
        [],
        "Member",
      ),
    ).toEqual({
      kind: "members",
      members: [{ id: "gone", firstName: "Member", lastName: "", avatarUrl: null }],
    });
  });

  it("renders assignments as avatar chips and linked records as record chips with the list icon and color", () => {
    expect(membersDescriptor([MEMBER.id, "gone"], [MEMBER], "Member")).toEqual({
      kind: "members",
      members: [MEMBER, { id: "gone", firstName: "Member", lastName: "", avatarUrl: null }],
    });
    expect(membersDescriptor([], [MEMBER], "Member")).toEqual({ kind: "empty" });
    expect(
      recordsDescriptor([{ ref: { typeId: "deals", recordId: "d1" }, title: "Renewal" }], {
        deals: { icon: "handshake", color: "info" },
      }),
    ).toEqual({ kind: "records", records: [{ id: "deals:d1", label: "Renewal", icon: "handshake", color: "info" }] });
  });
});
