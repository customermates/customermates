import { describe, expect, it, vi } from "vitest";

import { createPerson, findPersonByEmail, linkDirection } from "../person-lookup";

const LEADS = "00000000-0000-4000-8000-0000000000b1";
const PEOPLE = "00000000-0000-4000-8000-0000000000b2";
const DEALS = "00000000-0000-4000-8000-0000000000b3";
const LEAD_PERSON = "00000000-0000-4000-8000-0000000000d1";
const PERSON_DEALS = "00000000-0000-4000-8000-0000000000d2";
const PERSON_FIELD = "00000000-0000-4000-8000-0000000000e8";
const ADA = { typeId: PEOPLE, recordId: "00000000-0000-4000-8000-0000000000a1" };

const MODEL = {
  relationships: [
    { id: LEAD_PERSON, sourceTypeId: LEADS, targetTypeId: PEOPLE, archived: false },
    { id: PERSON_DEALS, sourceTypeId: PEOPLE, targetTypeId: DEALS, archived: false },
  ],
};

describe("linkDirection", () => {
  it("names the side of the configured relationship the record sits on", () => {
    expect(linkDirection(MODEL, { typeId: PEOPLE, relationshipId: LEAD_PERSON }, LEADS)).toBe("outgoing");
    expect(linkDirection(MODEL, { typeId: PEOPLE, relationshipId: PERSON_DEALS }, DEALS)).toBe("incoming");
  });

  it("refuses a relationship that does not join the two lists, an archived one and a list linked to itself", () => {
    expect(linkDirection(MODEL, { typeId: PEOPLE, relationshipId: PERSON_DEALS }, LEADS)).toBeNull();
    expect(linkDirection(MODEL, { typeId: PEOPLE, relationshipId: "missing" }, LEADS)).toBeNull();
    expect(
      linkDirection(
        { relationships: MODEL.relationships.map((entry) => ({ ...entry, archived: true })) },
        { typeId: PEOPLE, relationshipId: LEAD_PERSON },
        LEADS,
      ),
    ).toBeNull();
    expect(linkDirection(MODEL, { typeId: LEADS, relationshipId: LEAD_PERSON }, LEADS)).toBeNull();
  });
});

describe("findPersonByEmail", () => {
  it("looks the address up company wide in one list and returns the first owner", async () => {
    const lookup = { getIdentityOwnersCompanyWide: vi.fn().mockResolvedValue([{ ref: ADA }]) };

    await expect(findPersonByEmail(lookup as never, PEOPLE, "ada@example.com")).resolves.toEqual(ADA);
    expect(lookup.getIdentityOwnersCompanyWide).toHaveBeenCalledWith(
      [{ channelClass: "email", value: "ada@example.com" }],
      [PEOPLE],
      { limitPerKey: 1 },
    );
  });

  it("returns nothing when no record owns the address", async () => {
    const lookup = { getIdentityOwnersCompanyWide: vi.fn().mockResolvedValue([]) };

    await expect(findPersonByEmail(lookup as never, PEOPLE, "ada@example.com")).resolves.toBeNull();
  });
});

describe("createPerson", () => {
  it("creates the record with the name field and the mail identity and returns its reference", async () => {
    const writer = { invoke: vi.fn().mockResolvedValue({ ok: true, data: { status: "completed", refs: [ADA] } }) };

    const created = await createPerson(
      writer,
      4,
      { typeId: PEOPLE, nameFieldId: PERSON_FIELD },
      "ada@example.com",
      "Ada",
      "key-1",
    );

    expect(created).toEqual(ADA);
    expect(writer.invoke).toHaveBeenCalledWith({
      expectedRevision: 4,
      idempotencyKey: "key-1",
      mutation: {
        action: "create",
        typeId: PEOPLE,
        fields: [{ fieldId: PERSON_FIELD, value: { kind: "text", value: "Ada" } }],
        identities: [{ provider: "mail", value: "ada@example.com", displayName: "Ada" }],
      },
    });
  });

  it("writes no name when the list has no name field or the visitor gave none, and returns nothing on failure", async () => {
    const writer = { invoke: vi.fn().mockResolvedValue({ ok: false, error: { issues: [] } }) };

    await expect(
      createPerson(writer, 1, { typeId: PEOPLE, nameFieldId: null }, "ada@example.com", "Ada", "key-2"),
    ).resolves.toBeNull();
    expect(writer.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ mutation: expect.objectContaining({ fields: [] }) }),
    );

    await createPerson(writer, 1, { typeId: PEOPLE, nameFieldId: PERSON_FIELD }, "ada@example.com", null, "key-3");
    expect(writer.invoke).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mutation: expect.objectContaining({ identities: [{ provider: "mail", value: "ada@example.com" }] }),
      }),
    );
  });
});
