import type { Prisma } from "@/generated/prisma";

import { SYNTHETIC_CONTACT_AVATAR_PATHS } from "./avatars";
import type { SeedContext } from "./context";
import { fixtureId, relationshipTarget, upsertFixturesById } from "./helpers";
import type { OrganizationFixture } from "./organizations";
import { SYNTHETIC_ORGANIZATION_DEFINITIONS } from "./organizations";

export const SYNTHETIC_CONTACT_NAMES = [
  ["Leon", "Becker"],
  ["Tim", "Wagner"],
  ["Lucio", "Ball"],
  ["Mara", "Bauer"],
  ["Max", "Schmidt"],
  ["Sophie", "Hoffmann"],
  ["Jonas", "Weber"],
  ["Amin", "Hassan"],
  ["Lea", "Bauer"],
  ["Maxine", "Zoll"],
  ["Lina", "Alvarez"],
  ["Felix", "Koch"],
  ["Omar", "Khalil"],
  ["Tim", "Weber"],
  ["Kian", "Rahimi"],
  ["Leila", "Chen"],
  ["Mia", "Schneider"],
  ["Laura", "Fischer"],
  ["Amir", "Haddad"],
  ["Sophie", "Wagner"],
  ["Reinhold", "Mertens"],
  ["Alexej", "Sofr"],
  ["Anna", "Müller"],
  ["Yasmin", "Farouk"],
  ["Lukas", "Fischer"],
  ["Felix", "Schneider"],
  ["Rashid", "Malik"],
  ["Paul", "Koch"],
  ["Nia", "Johnson"],
  ["Paul", "Fischer"],
] as const;

export const SYNTHETIC_CONTACT_EMAIL_LOCAL_PARTS = [
  "leon.becker",
  "tim.wagner",
  "lucio.ball",
  "mara.bauer",
  "max.schmidt",
  "sophie.hoffmann",
  "jonas.weber",
  "amin.hassan",
  "lea.bauer",
  "maxine.zoll",
  "lina.alvarez",
  "felix.koch",
  "omar.khalil",
  "tim.weber",
  "kian.rahimi",
  "leila.chen",
  "mia.schneider",
  "laura.fischer",
  "amir.haddad",
  "sophie.wagner",
  "reinhold.mertens",
  "alexej.sofr",
  "anna.mueller",
  "yasmin.farouk",
  "lukas.fischer",
  "felix.schneider",
  "rashid.malik",
  "paul.koch",
  "nia.johnson",
  "paul.fischer",
] as const;

export const SYNTHETIC_CONTACT_ORGANIZATION_LINKS = [
  [0, 14],
  [1, 12],
  [2, 0],
  [3, 8],
  [4, 14],
  [5, 8],
  [6, 9],
  [7, 15],
  [8, 9],
  [9, 11],
  [10, 0],
  [11, 9],
  [12, 4],
  [13, 3],
  [14, 1],
  [15, 2],
  [16, 13],
  [17, 3],
  [18, 10],
  [19, 14],
  [20, 18],
  [21, 2],
  [22, 13],
  [23, 5],
  [24, 13],
  [25, 17],
  [26, 6],
  [27, 7],
  [28, 11],
  [29, 8],
] as const;

export const SYNTHETIC_CONTACT_EMAIL_ADDRESSES = SYNTHETIC_CONTACT_EMAIL_LOCAL_PARTS.map((localPart, index) => {
  const organizationIndex = relationshipTarget(SYNTHETIC_CONTACT_ORGANIZATION_LINKS, index, "contact-organization");
  const organization = SYNTHETIC_ORGANIZATION_DEFINITIONS[organizationIndex];
  if (!organization) throw new Error(`Missing organization definition for contact fixture index ${index}`);

  return `${localPart}@${organization.emailDomain}`;
});

export type ContactDefinition = readonly [
  firstName: (typeof SYNTHETIC_CONTACT_NAMES)[number][0],
  lastName: (typeof SYNTHETIC_CONTACT_NAMES)[number][1],
  emailAddress: (typeof SYNTHETIC_CONTACT_EMAIL_ADDRESSES)[number],
  organizationIndex: number,
];

export type ContactFixture = {
  avatarUrl: string;
  companyId: string;
  firstName: ContactDefinition[0];
  id: string;
  lastName: ContactDefinition[1];
};

export type ContactSeedData = {
  contactDefinitions: ContactDefinition[];
  contacts: ContactFixture[];
};

export async function seedContacts(
  context: SeedContext,
  organizations: ReadonlyArray<OrganizationFixture>,
): Promise<ContactSeedData> {
  const contactDefinitions = SYNTHETIC_CONTACT_NAMES.map(([firstName, lastName], index) => {
    const organizationIndex = relationshipTarget(SYNTHETIC_CONTACT_ORGANIZATION_LINKS, index, "contact-organization");
    if (!organizations[organizationIndex])
      throw new Error(`Missing organization fixture for contact fixture index ${index}`);

    return [firstName, lastName, SYNTHETIC_CONTACT_EMAIL_ADDRESSES[index], organizationIndex] as const;
  });

  const contacts = contactDefinitions.map(([firstName, lastName], index) => {
    const avatarPath = SYNTHETIC_CONTACT_AVATAR_PATHS[index];
    if (!avatarPath) throw new Error(`Missing avatar fixture for contact fixture index ${index}`);

    return {
      id: fixtureId("60000000", index + 1),
      avatarUrl: avatarPath,
      companyId: context.ids.company,
      firstName,
      lastName,
    } satisfies Prisma.ContactCreateManyInput;
  });

  await upsertFixturesById(contacts, (contact) =>
    context.prisma.contact.upsert({
      where: { id: contact.id },
      update: contact,
      create: contact,
    }),
  );

  return { contactDefinitions, contacts };
}
