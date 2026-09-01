import { describe, expect, it } from "vitest";

import { CreateManyContactsSchema } from "../upsert/create-many-contacts.interactor";
import { CreateManyOrganizationsSchema } from "@/features/organizations/upsert/create-many-organizations.interactor";
import { UpdateManyContactsSchema } from "../upsert/update-many-contacts.interactor";

const CONTACT_ID = "60000000-0000-4000-8000-000000000001";

function pathsOf(result: { success: boolean; error?: { issues: Array<{ path: Array<PropertyKey> }> } }): string[] {
  return result.success ? [] : (result.error?.issues ?? []).map((issue) => issue.path.join("."));
}

describe("bulk contact validation is independent per row", () => {
  it("still reports a bad channel on one row when another row is missing a required field", () => {
    const result = CreateManyContactsSchema.safeParse({
      contacts: [
        { firstName: "Ada", notes: null, identifiers: [] },
        {
          firstName: "Grace",
          lastName: "Hopper",
          notes: null,
          identifiers: [{ provider: "whatsapp", value: "hello world" }],
        },
      ],
    });

    expect(pathsOf(result)).toEqual(["contacts.0.lastName", "contacts.1.identifiers.0.value"]);
  });

  it("reports the same for an update batch, keyed on the missing id", () => {
    const result = UpdateManyContactsSchema.safeParse({
      contacts: [{ firstName: "Ada" }, { id: CONTACT_ID, identifiers: [{ provider: "mail", value: "not-an-email" }] }],
    });

    expect(pathsOf(result)).toContain("contacts.1.identifiers.0.value");
  });

  it("normalizes a channel value in place, which the row refinement must not lose", () => {
    const result = CreateManyContactsSchema.safeParse({
      contacts: [
        {
          firstName: "Ada",
          lastName: "Lovelace",
          notes: null,
          identifiers: [{ provider: "whatsapp", value: "+49 151 12345678" }],
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.contacts[0].identifiers?.[0].value).toBe("+4915112345678");
  });

  it("still converts notes to the editor document, which the row refinement must not lose", () => {
    const result = CreateManyContactsSchema.safeParse({
      contacts: [{ firstName: "Ada", lastName: "Lovelace", notes: "**bold**", identifiers: [] }],
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.contacts[0].notes).toMatchObject({ type: "doc" });
  });

  it("applies the same independence to an entity that only validates notes", () => {
    const result = CreateManyOrganizationsSchema.safeParse({
      organizations: [{ notes: null }, { name: "Acme GmbH", notes: "**bold**" }],
    });

    expect(pathsOf(result)).toEqual(["organizations.0.name"]);
  });
});
