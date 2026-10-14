import { describe, expect, it } from "vitest";

import { activitySubject } from "../system-audit-events";

const MEMBER_ID = "00000000-0000-4000-8000-000000000001";
const ROLE_ID = "00000000-0000-4000-8000-000000000002";
const MEMBER = {
  id: MEMBER_ID,
  firstName: "Invited",
  lastName: "Member",
  avatarUrl: "https://example.test/member.png",
};

function event(subjectKind: string, payload: unknown, subjectId = ROLE_ID) {
  return { subjectKind, subjectId, payload } as Parameters<typeof activitySubject>[0];
}

describe("activitySubject", () => {
  it("names the member a member event changed with the current member, not the acting admin", () => {
    expect(
      activitySubject(event("user", { changes: { status: { previous: "inactive", current: "active" } } }, MEMBER_ID), [
        MEMBER,
      ]),
    ).toEqual({ kind: "user", member: MEMBER });
  });

  it("falls back to the stored name of a member who is no longer in the workspace, and to no name at all", () => {
    expect(
      activitySubject(
        event(
          "user",
          { email: "gone@example.test", firstName: "Gone", lastName: "Person", status: "active" },
          MEMBER_ID,
        ),
        [],
      ),
    ).toEqual({ kind: "user", member: { id: MEMBER_ID, firstName: "Gone", lastName: "Person", avatarUrl: null } });
    expect(activitySubject(event("user", { changes: { status: { previous: "active" } } }, MEMBER_ID), [])).toEqual({
      kind: "user",
      member: { id: MEMBER_ID, firstName: "", lastName: "", avatarUrl: null },
    });
  });

  it("names a role from the label stored with the event, so a deleted role still reads", () => {
    expect(activitySubject(event("role", { id: ROLE_ID, name: "Field team", permissions: [] }), [])).toEqual({
      kind: "role",
      id: ROLE_ID,
      label: "Field team",
    });
    expect(
      activitySubject(
        event("role", {
          role: { id: ROLE_ID, name: "Field team" },
          changes: { description: { previous: null, current: "Visits customers" } },
        }),
        [],
      ),
    ).toEqual({ kind: "role", id: ROLE_ID, label: "Field team" });
  });

  it.each([
    ["webhook", { webhook: { url: "https://receiver.example" }, changes: {} }, "https://receiver.example"],
    ["routine", { id: ROLE_ID, name: "Weekly digest" }, "Weekly digest"],
    ["wiki_page", { wikiPage: { title: "Refund policy" }, changes: {} }, "Refund policy"],
    [
      "connected_account",
      { provider: "google", displayName: " ", emailAddress: "team@example.test" },
      "team@example.test",
    ],
    [
      "connected_account",
      { connectedAccount: { provider: "google", displayName: "Sales inbox", emailAddress: null }, changes: {} },
      "Sales inbox",
    ],
  ])("names a %s from its stored label", (kind, payload, label) => {
    expect(activitySubject(event(kind, payload), [])).toEqual({ kind, id: ROLE_ID, label });
  });

  it.each([
    ["legal", { versions: {}, acceptingEmail: "owner@example.test" }],
    ["records", { typeId: ROLE_ID, rowCount: 10 }],
    ["connected_account", null],
    ["webhook", { changes: { name: { previous: "Before", current: "After" } } }],
    ["role", { name: "  " }],
  ])("leaves a %s entry without a nameable subject unnamed", (kind, payload) => {
    expect(activitySubject(event(kind, payload), [])).toBeNull();
  });
});
