import { describe, expect, it } from "vitest";

import { planLinkedinIdentityConsolidation, type LinkedinIdentityRow } from "../linkedin-identity-consolidation";

const MEMBER = "ACoAAB8eNoQBhr8Ek4Y-7zwwnasJF849Xk3zums";
const OTHER_MEMBER = "ACoAAAGM_VUBCu28ZaCdC_Ae5OPR3khfJJOBDlk";
const URL = "https://www.linkedin.com/in/francesca-pollard-004a12126/";
const person = { typeId: "contact", recordId: "person" };

function row(id: string, fields: Partial<LinkedinIdentityRow>): LinkedinIdentityRow {
  const value = fields.value ?? id;
  return {
    id,
    value,
    messagingId: null,
    displayName: null,
    profileUrl: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    keys: [value, ...(fields.messagingId ? [fields.messagingId] : [])],
    records: [person],
    ...fields,
  };
}

describe("LinkedIn identity consolidation plan", () => {
  it("keeps the username identity, takes the member id as messaging id and unions keys and links", () => {
    const plan = planLinkedinIdentityConsolidation([
      row("member", {
        value: MEMBER,
        messagingId: MEMBER,
        profileUrl: URL,
        displayName: "Francesca",
      }),
      row("slug", {
        value: "francesca-pollard-004a12126",
        createdAt: "2026-11-02T00:00:00.000Z",
      }),
    ]);
    expect(plan.merges).toEqual([
      {
        survivorId: "slug",
        mergedIds: ["member"],
        value: "francesca-pollard-004a12126",
        messagingId: MEMBER,
        displayName: "Francesca",
        profileUrl: URL,
        keys: [MEMBER, "francesca-pollard-004a12126"],
        records: [person],
      },
    ]);
    expect(plan.backfills).toEqual([]);
  });

  it("reports groups with two member ids or different records instead of merging them", () => {
    const plan = planLinkedinIdentityConsolidation([
      row("a", { value: MEMBER, profileUrl: URL }),
      row("b", { value: OTHER_MEMBER, profileUrl: URL }),
      row("c", {
        value: "jane",
        profileUrl: "https://www.linkedin.com/in/jane",
      }),
      row("d", {
        value: OTHER_MEMBER.replace("AAGM", "ZZZZ"),
        profileUrl: "https://www.linkedin.com/in/jane",
        records: [{ typeId: "contact", recordId: "other" }],
      }),
    ]);
    expect(plan.merges).toEqual([]);
    expect(plan.skipped).toEqual([
      { identityIds: ["a", "b"], reason: "memberIdConflict" },
      { identityIds: ["c", "d"], reason: "differentRecords" },
    ]);
  });

  it("backfills only the canonical keys a single identity lacks and plans nothing once they exist", () => {
    const single = row("single", { value: MEMBER, profileUrl: URL });
    expect(planLinkedinIdentityConsolidation([single]).backfills).toEqual([
      { identityId: "single", keys: ["francesca-pollard-004a12126"] },
    ]);
    const done = { ...single, keys: [MEMBER, "francesca-pollard-004a12126"] };
    expect(planLinkedinIdentityConsolidation([done])).toMatchObject({
      merges: [],
      backfills: [],
      skipped: [],
    });
  });

  it("never joins identities without a shared key, such as a member id without a profile URL", () => {
    const plan = planLinkedinIdentityConsolidation([
      row("luigi-member", { value: MEMBER, messagingId: MEMBER }),
      row("luigi-slug", {
        value: "luigi-borriello-8704b22b3",
        profileUrl: "https://www.linkedin.com/in/luigi-borriello-8704b22b3",
      }),
    ]);
    expect(plan).toMatchObject({ merges: [], backfills: [], skipped: [] });
  });
});
