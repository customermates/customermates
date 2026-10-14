import type { SeedContext } from "./context";
import { NORTHWIND_NAMED_CONTACTS, northwindAt, northwindDataset } from "./northwind-data";
import { northwindUpdatedAt } from "./northwind-history";
import type { OrganizationFixture } from "./organizations";

/** Contacts with an approved avatar photo, in avatar order (the first contacts of the workspace). */
export const SYNTHETIC_CONTACT_NAMES = NORTHWIND_NAMED_CONTACTS;

export const SYNTHETIC_CONTACT_EMAIL_ADDRESSES = northwindDataset().contacts.map(({ email }) => email);

export type ContactDefinition = readonly [
  firstName: string,
  lastName: string,
  emailAddress: string,
  organizationIndex: number,
];

export type ContactFixture = {
  avatarUrl: string | null;
  companyId: string;
  createdAt: Date;
  firstName: string;
  id: string;
  lastName: string;
  updatedAt: Date;
};

export type ContactSeedData = {
  contactDefinitions: ContactDefinition[];
  contacts: ContactFixture[];
};

export function seedContacts(
  context: SeedContext,
  organizations: ReadonlyArray<OrganizationFixture>,
): Promise<ContactSeedData> {
  const dataset = northwindDataset().contacts;
  const contactDefinitions = dataset.map(({ firstName, lastName, email, organizationIndex }, index) => {
    if (!organizations[organizationIndex]) throw new Error(`Missing organization fixture for contact ${index}`);
    return [firstName, lastName, email, organizationIndex] as const;
  });
  const contacts = dataset.map(
    (contact) =>
      ({
        id: contact.id,
        avatarUrl: contact.avatarUrl,
        companyId: context.ids.company,
        firstName: contact.firstName,
        lastName: contact.lastName,
        createdAt: northwindAt(contact.createdAtMs),
        updatedAt: northwindUpdatedAt("contact", contact.id, contact.createdAtMs),
      }) satisfies ContactFixture,
  );

  return Promise.resolve({ contactDefinitions, contacts });
}
