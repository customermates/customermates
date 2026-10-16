import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  SYNTHETIC_COMPANY_USERS,
  SYNTHETIC_SEED_USER,
  SYNTHETIC_SHARED_USER_PASSWORD,
} from "@/core/config/synthetic-seed-user";
import { presetId } from "@/features/records/crm-preset";
import { normalizedIdentity } from "@/features/records/record-identity";

import { SYNTHETIC_AVATAR_ORIGIN, SYNTHETIC_AVATAR_URLS, SYNTHETIC_CONTACT_AVATAR_URLS } from "../seeds/avatars";
import { SYNTHETIC_CONTACT_EMAIL_ADDRESSES, SYNTHETIC_CONTACT_NAMES, seedContacts } from "../seeds/contacts";
import { SEED_IDS, type SeedContext } from "../seeds/context";
import {
  SYNTHETIC_CUSTOM_FIELD_DEFINITIONS,
  SYNTHETIC_CUSTOM_OPTION_IDS,
  seedCustomFields,
} from "../seeds/custom-fields";
import { seedDeals } from "../seeds/deals";
import { fixtureId } from "../seeds/helpers";
import { SYNTHETIC_AUTH_IDENTITY_DEFINITIONS, SYNTHETIC_SUBSCRIPTION } from "../seeds/identity";
import { SYNTHETIC_COMPANY_MEMBER_DEFINITIONS } from "../seeds/members";
import {
  NORTHWIND_SEAT_PRICES,
  NORTHWIND_SERVICES,
  NORTHWIND_STORY_END_MS,
  buildNorthwindDataset,
  northwindDataset,
} from "../seeds/northwind-data";
import {
  NORTHWIND_MEMBER_IDS,
  NORTHWIND_MEMBER_ROLES,
  NORTHWIND_MODEL_IDS,
  NORTHWIND_ROLE_IDS,
} from "../seeds/northwind-model";
import { buildNorthwindIdentities, buildNorthwindRecords } from "../seeds/northwind-records";
import { NORTHWIND_FILE_ID_PREFIX, northwindRecordFiles } from "../seeds/northwind-files";
import { people } from "../seeds/messaging/fixtures";
import { NORTHWIND_OPTION_LABELS } from "../seeds/northwind-schema";
import { seedOrganizations, SYNTHETIC_ORGANIZATION_DEFINITIONS } from "../seeds/organizations";
import { syntheticRecordModel } from "../seeds/records";
import { SYNTHETIC_ROLE_DEFINITIONS } from "../seeds/roles";
import { seedServices } from "../seeds/services";
import { seedTasks } from "../seeds/tasks";
import { SYNTHETIC_SEED_TIMELINE } from "../seeds/timeline";

const DAY = 86_400_000;
const context = { ids: SEED_IDS } as SeedContext;
const data = northwindDataset();

const labels = (field: keyof typeof NORTHWIND_OPTION_LABELS) =>
  NORTHWIND_OPTION_LABELS[field].map(([, label]) => label);

async function model() {
  const organizations = await seedOrganizations(context);
  const contacts = await seedContacts(context, organizations.organizations);
  const services = await seedServices(context);
  const deals = await seedDeals(context, services);
  const tasks = await seedTasks(context);
  return syntheticRecordModel(
    context,
    seedCustomFields(context, { ...organizations, ...contacts, ...services, ...deals, ...tasks }),
  );
}

describe("Northwind Labs demo fixture contract", () => {
  it("keeps the sign-in identity, its shared password and the active Pro subscription", () => {
    expect(SYNTHETIC_SEED_USER).toEqual({
      email: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
      password: SYNTHETIC_SHARED_USER_PASSWORD,
    });
    expect(SYNTHETIC_SUBSCRIPTION).toEqual({
      agentCreditAnchorAt: SYNTHETIC_SEED_TIMELINE.company.createdAt,
      plan: "pro",
      quantity: null,
      status: "active",
    });
    expect(SYNTHETIC_AUTH_IDENTITY_DEFINITIONS.map(({ userId }) => userId)).toEqual([
      SEED_IDS.user,
      SEED_IDS.sofiaRossiUser,
      SEED_IDS.elenaHoffmannUser,
    ]);
    const memberById = new Map(SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.map((member) => [member.id, member]));
    for (const identity of SYNTHETIC_AUTH_IDENTITY_DEFINITIONS)
      expect(memberById.get(identity.userId)?.email).toBe(identity.email);
  });

  it("seeds seven members in six roles, each with a distinct avatar photo", () => {
    expect(SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.map(({ firstName, lastName }) => `${firstName} ${lastName}`)).toEqual([
      "Max Bergmann",
      "Sofia Rossi",
      "Elena Hoffmann",
      "Clara Neumann",
      "Marco Silva",
      "Kian Rahimi",
      "Laura Fischer",
    ]);
    expect(SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.map(({ id }) => id)).toEqual(Object.values(NORTHWIND_MEMBER_IDS));
    expect(SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.map(({ roleId }) => roleId)).toEqual(
      Object.values(NORTHWIND_MEMBER_ROLES),
    );
    expect(new Set(SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.map(({ avatarPath }) => avatarPath)).size).toBe(7);
    expect(SYNTHETIC_ROLE_DEFINITIONS.map(({ id, name }) => [id, name])).toEqual([
      [NORTHWIND_ROLE_IDS.admin, "Admin"],
      [NORTHWIND_ROLE_IDS.salesLead, "Sales lead"],
      [NORTHWIND_ROLE_IDS.customerSuccess, "Customer success"],
      [NORTHWIND_ROLE_IDS.accountExecutive, "Account executive"],
      [NORTHWIND_ROLE_IDS.support, "Support"],
      [NORTHWIND_ROLE_IDS.peopleOperations, "People and operations"],
    ]);
    const grants = new Map(
      SYNTHETIC_ROLE_DEFINITIONS.map(({ id, recordGrants }) => [
        id,
        new Map<string, readonly string[]>(recordGrants as ReadonlyArray<readonly [string, readonly string[]]>),
      ]),
    );
    expect(grants.get(NORTHWIND_ROLE_IDS.accountExecutive)?.get("deal")).toEqual(["create", "readOwn", "update"]);
    expect(grants.get(NORTHWIND_ROLE_IDS.accountExecutive)?.get("subscription")).toEqual(["readAll"]);
    expect(grants.get(NORTHWIND_ROLE_IDS.support)?.has("deal")).toBe(false);
    expect(grants.get(NORTHWIND_ROLE_IDS.support)?.get("organization")).toEqual(["readAll"]);
    expect(grants.get(NORTHWIND_ROLE_IDS.peopleOperations)?.has("deal")).toBe(false);
    expect(grants.get(NORTHWIND_ROLE_IDS.peopleOperations)?.has("candidate")).toBe(true);
    const permissions = SYNTHETIC_ROLE_DEFINITIONS.flatMap(({ permissions }) => permissions);
    expect(new Set(permissions.map(({ id }) => id)).size).toBe(permissions.length);
  });

  it("ships every avatar photo once, across the named contacts and the members", () => {
    const contactAvatars = data.contacts.flatMap(({ avatarUrl }) => (avatarUrl ? [avatarUrl] : []));
    const memberAvatars = SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.map(({ avatarPath }) => avatarPath);
    expect(contactAvatars).toEqual([...SYNTHETIC_CONTACT_AVATAR_URLS]);
    expect(SYNTHETIC_CONTACT_AVATAR_URLS).toHaveLength(SYNTHETIC_CONTACT_NAMES.length);
    expect(new Set([...contactAvatars, ...memberAvatars]).size).toBe(35);
    for (const avatarUrl of new Set([...contactAvatars, ...memberAvatars, ...Object.values(SYNTHETIC_AVATAR_URLS)])) {
      expect(avatarUrl).toMatch(/^https:\/\/customermates\.com\/demo\/avatars\/photos\/[a-z-]+\.png$/);
      const avatarFile = new URL(`../../public${avatarUrl.slice(SYNTHETIC_AVATAR_ORIGIN.length)}`, import.meta.url);
      expect(existsSync(avatarFile), `${avatarUrl} must ship from public`).toBe(true);
      const source = readFileSync(avatarFile);
      expect(source.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(source.readUInt32BE(16)).toBe(source.readUInt32BE(20));
    }
  });

  it("generates the agreed volumes deterministically", () => {
    expect(buildNorthwindDataset()).toEqual(buildNorthwindDataset());
    expect({
      organizations: data.organizations.length,
      contacts: data.contacts.length,
      subscriptions: data.subscriptions.length,
      onboardings: data.onboardings.length,
      tickets: data.tickets.length,
      campaigns: data.campaigns.length,
      partners: data.partners.length,
      openRoles: data.openRoles.length,
      candidates: data.candidates.length,
      services: data.services.length,
    }).toEqual({
      organizations: 120,
      contacts: 350,
      subscriptions: 90,
      onboardings: 25,
      tickets: 150,
      campaigns: 8,
      partners: 6,
      openRoles: 6,
      candidates: 40,
      services: 8,
    });
    expect(data.deals.length).toBeGreaterThanOrEqual(200);
    expect(data.deals.length).toBeLessThanOrEqual(240);
    expect(data.lineItems.length).toBeGreaterThan(data.deals.length);
    expect(new Set(data.tasks.map(({ team }) => team))).toEqual(
      new Set(NORTHWIND_OPTION_LABELS["task.team"].map(([key]) => key)),
    );
  });

  it("uses fictional organizations with reserved example domains", () => {
    expect(new Set(SYNTHETIC_ORGANIZATION_DEFINITIONS.map(({ name }) => name)).size).toBe(120);
    for (const { emailDomain, website } of SYNTHETIC_ORGANIZATION_DEFINITIONS) {
      expect(emailDomain).toMatch(/^[a-z0-9-]+\.example$/);
      expect(website).toBe(`https://www.${emailDomain}`);
    }
    for (const [index, contact] of data.contacts.entries()) {
      const organization = data.organizations[contact.organizationIndex];
      expect(SYNTHETIC_CONTACT_EMAIL_ADDRESSES[index]).toBe(contact.email);
      expect(contact.email.endsWith(`@${organization?.domain}`)).toBe(true);
    }
    for (const partner of data.partners) expect(partner.website).toMatch(/^https:\/\/www\.[a-z-]+\.example$/);
    for (const candidate of data.candidates) expect(candidate.email).toMatch(/@mail\.example$/);
  });

  it("follows the Knowledge Base for stages, prices, priorities, tiers and naming", () => {
    expect(labels("deal.stage")).toEqual(["New", "Qualified", "Proposal", "Won", "Lost"]);
    expect(labels("deal.lostReason")).toEqual([
      "Price",
      "No decision",
      "Competitor",
      "Timing",
      "Product gap",
      "Not a fit",
    ]);
    expect(labels("deal.leadSource")).toEqual([
      "Website demo request",
      "Content download",
      "Webinar",
      "Trade fair",
      "Paid search",
      "LinkedIn",
      "Outbound",
      "Partner referral",
      "Customer referral",
    ]);
    expect(labels("ticket.priority")).toEqual(["P1 Critical", "P2 High", "P3 Normal", "P4 Low"]);
    expect(labels("onboarding.phase")).toEqual([
      "Kickoff",
      "Configuration",
      "Pilot",
      "Go-live",
      "Hypercare",
      "Completed",
    ]);
    expect(labels("partner.tier")).toEqual(["Referral", "Silver reseller", "Gold implementation"]);
    expect(labels("candidate.stage")).toEqual([
      "Applied",
      "Screening",
      "Interview",
      "Case task",
      "Offer",
      "Hired",
      "Rejected",
    ]);
    expect(labels("subscription.health")).toEqual(["Green", "Amber", "Red"]);
    expect(NORTHWIND_SEAT_PRICES).toEqual({ starter: 29, professional: 49, enterprise: 79 });
    expect(NORTHWIND_SERVICES.map(([name, price]) => `${name}: ${price}`)).toEqual([
      "Northwind Field Starter seat (annual): 348",
      "Northwind Field Professional seat (annual): 588",
      "Northwind Field Enterprise seat (annual): 948",
      "Onboarding Quick Start: 2900",
      "Onboarding Standard: 8500",
      "Onboarding Enterprise: 19000",
      "Integration work (day): 1250",
      "On-site training (day): 1600",
    ]);
    for (const deal of data.deals) {
      expect(deal.name).toMatch(
        /^.+ - (Starter|Professional|Enterprise) \d+ - (New|Expansion|Renewal)( \d{4}(-\d+)?)?$/,
      );
    }
    for (const campaign of data.campaigns) expect(campaign.name).toMatch(/^\d{4}-Q[1-4] \S/);
    for (const subscription of data.subscriptions) {
      expect(subscription.pricePerSeat).toBe(NORTHWIND_SEAT_PRICES[subscription.plan]);
      expect(subscription.arr).toBe(subscription.annualPrice ?? subscription.seats * subscription.pricePerSeat * 12);
    }
    for (const deal of data.deals.filter(({ type }) => type === "new"))
      expect(deal.seats).toBeGreaterThanOrEqual({ starter: 10, professional: 25, enterprise: 75 }[deal.plan]);
    for (const deal of data.deals) expect(deal.discountPercent).toBeLessThanOrEqual(30);
  });

  it("keeps stages, outcomes and dates consistent over the eighteen months", () => {
    const start = NORTHWIND_STORY_END_MS - 548 * DAY;
    for (const deal of data.deals) {
      expect(deal.createdAtMs).toBeGreaterThanOrEqual(start - 90 * DAY);
      expect(deal.createdAtMs).toBeLessThan(NORTHWIND_STORY_END_MS);
      expect(deal.closeAtMs).toBeGreaterThan(deal.createdAtMs);
      if (deal.status === "open") {
        expect(["new", "qualified", "proposal"]).toContain(deal.stage);
        expect(deal.closeAtMs).toBeGreaterThan(NORTHWIND_STORY_END_MS - 2 * DAY);
        expect(deal.lostReason).toBeNull();
      } else {
        expect(deal.closeAtMs).toBeLessThan(NORTHWIND_STORY_END_MS);
        expect(deal.stage).toBe(deal.status === "won" ? "won" : "lost");
        expect(deal.lostReason === null).toBe(deal.status === "won");
      }
    }
    const months = new Set(data.deals.map(({ createdAtMs }) => new Date(createdAtMs).toISOString().slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(18);
    for (const subscription of data.subscriptions) {
      expect(subscription.renewalMs).toBeGreaterThan(NORTHWIND_STORY_END_MS);
      expect(subscription.renewalMs).toBeLessThanOrEqual(NORTHWIND_STORY_END_MS + 366 * DAY);
    }
    expect(data.subscriptions.some(({ health }) => health === "atRisk")).toBe(true);
    const open = data.tickets.filter(({ resolvedMs }) => resolvedMs === null);
    expect(open.length).toBeGreaterThan(0);
    expect(open.length).toBeLessThan(30);
    expect(open.some(({ slaDueMs, lastResponseMs }) => slaDueMs < lastResponseMs)).toBe(true);
    for (const onboarding of data.onboardings) {
      const deal = data.deals[onboarding.dealIndex];
      expect(deal).toMatchObject({ status: "won", type: "new", organizationIndex: onboarding.organizationIndex });
    }
  });

  it("configures every field type and calculation kind with stable starter ids", async () => {
    const configured = await model();
    const id = (key: string) => presetId(SEED_IDS.company, key);
    for (const key of ["contact", "organization", "deal", "lineItem", "service", "task"])
      expect(configured.types.some((type) => type.id === id(key))).toBe(true);
    expect(configured.types.find((type) => type.id === id("service"))?.pluralLabel).toBe("Products and services");
    expect(configured.types.map(({ id: typeId }) => typeId)).toEqual(
      expect.arrayContaining(Object.values(NORTHWIND_MODEL_IDS.types)),
    );
    expect(new Set(configured.fields.map(({ valueType }) => valueType))).toEqual(
      new Set([
        "text",
        "richText",
        "number",
        "currency",
        "boolean",
        "date",
        "dateRange",
        "select",
        "email",
        "url",
        "member",
        "channels",
        "address",
        "file",
      ]),
    );
    expect(new Set(configured.fields.map(({ behavior }) => behavior.kind))).toEqual(
      new Set(["input", "formula", "lookup", "rollup", "snapshot"]),
    );
    expect(configured.fields.some(({ valueType, multiple }) => valueType === "select" && multiple)).toBe(true);
    expect(new Set(configured.fields.flatMap(({ format }) => (format?.currency ? [format.currency] : [])))).toEqual(
      new Set(["EUR", "CHF"]),
    );
    expect(
      configured.fields.find(({ id: fieldId }) => fieldId === NORTHWIND_MODEL_IDS.fields.organization.legacyAccountId)
        ?.archived,
    ).toBe(true);
    expect(
      configured.types.find(({ id: typeId }) => typeId === id("organization"))?.relationshipPaths?.[0]?.path,
    ).toHaveLength(3);
    const optionIds = Object.values(SYNTHETIC_CUSTOM_OPTION_IDS).flatMap((group) => Object.values(group));
    expect(optionIds).toEqual([
      ...Array.from({ length: 4 }, (_, index) => fixtureId("17000000", index + 1)),
      fixtureId("17000000", 27),
      ...Array.from({ length: 22 }, (_, index) => fixtureId("17000000", index + 5)),
    ]);
    expect(SYNTHETIC_CUSTOM_FIELD_DEFINITIONS).toHaveLength(9);
  });

  it("keeps every demo contact's number in Channels as one phone identity, never as a phone field", () => {
    const phones = buildNorthwindIdentities().filter((identity) => identity.provider === "phone");
    expect(phones.map((identity) => identity.recordId)).toEqual(data.contacts.map((contact) => contact.id));
    for (const identity of phones) expect(normalizedIdentity(identity)?.value).toBe(identity.value);
    const whatsapp = Object.values(people).flatMap((person) => (person.phone ? [person.phone] : []));
    expect(whatsapp.length).toBeGreaterThan(0);
    expect(phones.filter((identity) => whatsapp.includes(identity.value))).toEqual([]);
    expect(SYNTHETIC_CUSTOM_FIELD_DEFINITIONS.map((definition) => definition.label)).not.toContain("Phones");
  });

  it("gives every organization a hand-entered office address and two customers their Documents files", () => {
    const { values } = buildNorthwindRecords(SEED_IDS.company);
    const addresses = values.filter(({ fieldKey }) => fieldKey === "organization.address");
    expect(addresses.map(({ recordId }) => recordId)).toEqual(data.organizations.map(({ id }) => id));
    for (const { value } of addresses) {
      if (value.kind !== "address") throw new Error("Organization address is not an address value");
      expect(value.value).toMatchObject({
        location: null,
        verification: { status: "unverified", provider: null, checkedAt: null },
      });
      expect(value.value.street && value.value.postalCode && value.value.city && value.value.countryCode).toBeTruthy();
      expect(value.value.formatted).toContain(value.value.city);
    }
    expect(new Set(addresses.map(({ value }) => (value.kind === "address" ? value.value.formatted : ""))).size).toBe(
      addresses.length,
    );

    const files = northwindRecordFiles();
    const documents = values.filter(({ fieldKey }) => fieldKey === "organization.documents");
    expect(documents.flatMap(({ value }) => (value.kind === "file" ? value.value : [])).sort()).toEqual(
      files.map(({ id }) => id).sort(),
    );
    expect(new Set(files.map(({ organizationIndex }) => organizationIndex)).size).toBe(documents.length);
    for (const file of files) {
      expect(file.id.startsWith(`${NORTHWIND_FILE_ID_PREFIX}-`)).toBe(true);
      expect(new TextEncoder().encode(file.content).byteLength).toBeLessThan(4096);
      expect(file.uploadedAtMs).toBeLessThan(NORTHWIND_STORY_END_MS);
      expect(file.content).toContain(data.organizations[file.organizationIndex].name);
    }
  });

  it("links every generated record to existing records", () => {
    const { records, links } = buildNorthwindRecords(SEED_IDS.company);
    const known = new Set([
      ...records.map(({ typeKey, id }) => `${typeKey}:${id}`),
      ...data.contacts.map(({ id }) => `contact:${id}`),
      ...data.organizations.map(({ id }) => `organization:${id}`),
      ...data.deals.map(({ id }) => `deal:${id}`),
      ...data.tasks.map(({ id }) => `task:${id}`),
      ...data.services.map((_, index) => `service:${fixtureId("90000000", index + 1)}`),
    ]);
    for (const link of links) {
      expect(known.has(`${link.sourceKey}:${link.sourceId}`), `${link.relationKey} source`).toBe(true);
      expect(known.has(`${link.targetKey}:${link.targetId}`), `${link.relationKey} target`).toBe(true);
    }
    expect(new Set(links.map(({ prefix }) => `${prefix}`)).size).toBe(links.length);
    expect(new Set(links.map(({ relationKey }) => relationKey)).size).toBeGreaterThanOrEqual(18);
  });
});
