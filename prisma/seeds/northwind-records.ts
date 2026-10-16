import { presetId } from "@/features/records/crm-preset";
import type { RecordScalar } from "@/features/records/record-model.schema";

import { fixtureId } from "./helpers";
import { northwindOrganizationAddress } from "./northwind-addresses";
import { type MemberKey, northwindAt, northwindDataset, northwindDay, northwindDocument } from "./northwind-data";
import { northwindRecordFiles } from "./northwind-files";
import { northwindUpdatedAt } from "./northwind-history";
import { NORTHWIND_MEMBER_IDS, NORTHWIND_RECORD_ID_PREFIXES } from "./northwind-model";

const DAY = 86_400_000;

/** A readable line item name: the tier and seat count, the onboarding package, or the service days. */
function lineItemName(serviceIndex: number, quantity: number): string {
  const [name, , kind] = northwindDataset().services[serviceIndex] ?? ["Line item", 0, "training"];
  if (kind === "license") return `${name.replace(/^Northwind Field (\w+) seat.*$/, "$1")} - ${quantity} seats`;
  if (kind === "onboarding") return `${name.replace(/^Onboarding /, "")} onboarding`;
  const days = `${quantity} ${quantity === 1 ? "day" : "days"}`;
  return `${name.replace(/ \(day\)$/, "")} - ${days}`;
}

export type NorthwindRecordRow = { typeKey: string; id: string; createdAt: Date; updatedAt: Date };
export type NorthwindValueRow = { typeKey: string; recordId: string; fieldKey: string; value: RecordScalar };
export type NorthwindLinkRow = {
  prefix: string;
  relationKey: string;
  sourceKey: string;
  sourceId: string;
  targetKey: string;
  targetId: string;
};
export type NorthwindAssignmentRow = { typeKey: string; recordId: string; userId: string };

const text = (value: string): RecordScalar => ({ kind: "text", value });
const number = (value: number): RecordScalar => ({ kind: "decimal", value: String(value), currency: null });
// Money is written in cents precision so float residue never reaches values, rollups or view totals.
const money = (value: number, currency = "EUR"): RecordScalar => ({
  kind: "decimal",
  value: String(Math.round(value * 100) / 100),
  currency,
});
const date = (ms: number): RecordScalar => ({ kind: "date", value: northwindDay(ms) });
const range = (start: number, end: number): RecordScalar => ({
  kind: "range",
  start: northwindDay(start),
  end: northwindDay(end),
});
const member = (key: MemberKey): RecordScalar => ({ kind: "member", value: NORTHWIND_MEMBER_IDS[key] });
const document = (lines: readonly string[] | string): RecordScalar => ({
  kind: "richText",
  documentJson: northwindDocument(lines),
});

/** The relationship link id prefix of each relationship the demo links. */
export const NORTHWIND_LINK_PREFIXES = {
  "contact.organizations": "c0000000",
  "deal.organizations": "f0000000",
  "deal.contacts": "19000000",
  "lineItem.deal": "12000000",
  "lineItem.service": "12100000",
  "task.contacts": "1a000000",
  "task.organizations": "1b000000",
  "task.deals": "1c000000",
  "task.services": "1d000000",
  "deal.campaign": "4b100000",
  "deal.partner": "4b200000",
  "subscription.organization": "4b300000",
  "subscription.deal": "4b400000",
  "onboarding.deal": "4b500000",
  "onboarding.organization": "4b600000",
  "onboarding.subscription": "4b700000",
  "ticket.subscription": "4b800000",
  "ticket.contact": "4b900000",
  "candidate.openRole": "4ba00000",
} as const;

/**
 * Records, values, links and assignments of the Northwind Labs demo beyond the starter names: line items, the
 * custom lists, and the fields the demo adds to the starter lists. Select values are option ids; the caller maps
 * field keys with `presetId`. Calculated fields (formula, lookup, rollup) are left to the calculation pass; the
 * snapshot fields (saved line prices, a won deal's contract value) are captured here as they were when frozen.
 */
export function buildNorthwindRecords(companyId: string) {
  const data = northwindDataset();
  const option = (field: string, key: string): RecordScalar => ({
    kind: "select",
    value: presetId(companyId, `${field}.${key}`),
  });
  const options = (field: string, keys: readonly string[]): RecordScalar => ({
    kind: "selectList",
    value: keys.map((key) => presetId(companyId, `${field}.${key}`)),
  });
  const records: NorthwindRecordRow[] = [];
  const values: NorthwindValueRow[] = [];
  const links: NorthwindLinkRow[] = [];
  const assignments: NorthwindAssignmentRow[] = [];
  const record = (typeKey: string, id: string, createdAtMs: number, updatedAt?: Date) =>
    records.push({
      typeKey,
      id,
      createdAt: northwindAt(createdAtMs),
      updatedAt: updatedAt ?? northwindUpdatedAt(typeKey, id, createdAtMs),
    });
  const set = (typeKey: string, recordId: string, entries: ReadonlyArray<readonly [string, RecordScalar | null]>) => {
    for (const [field, value] of entries) {
      if (value !== null)
        values.push({ typeKey, recordId, fieldKey: field.includes(".") ? field : `${typeKey}.${field}`, value });
    }
  };
  const counters = new Map<string, number>();
  const link = (
    relationKey: keyof typeof NORTHWIND_LINK_PREFIXES,
    sourceKey: string,
    sourceId: string,
    targetKey: string,
    targetId: string,
  ) => {
    const prefix = NORTHWIND_LINK_PREFIXES[relationKey];
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    links.push({ prefix: fixtureId(prefix, next), relationKey, sourceKey, sourceId, targetKey, targetId });
  };
  const assign = (typeKey: string, recordId: string, key: MemberKey | null) => {
    if (key) assignments.push({ typeKey, recordId, userId: NORTHWIND_MEMBER_IDS[key] });
  };

  // Organizations, contacts, services, deals, tasks: the fields the demo adds -----------------------------------------
  const lastOwner = new Map<number, MemberKey>();
  for (const deal of data.deals) if (deal.type !== "renewal") lastOwner.set(deal.organizationIndex, deal.ownerKey);
  const documents = new Map<number, string[]>();
  for (const file of northwindRecordFiles())
    documents.set(file.organizationIndex, [...(documents.get(file.organizationIndex) ?? []), file.id]);
  for (const organization of data.organizations) {
    const files = documents.get(organization.index);
    set("organization", organization.id, [
      ["industry", option("organization.industry", organization.industry)],
      ["companySize", number(organization.companySize)],
      ["segment", option("organization.segment", organization.segment)],
      ["address", { kind: "address", value: northwindOrganizationAddress(organization) }],
      ["documents", files ? { kind: "file", value: files } : null],
      ["notes", organization.notes ? document(organization.notes) : null],
    ]);
    const customer = organization.profile === "legacyCustomer" || organization.profile === "newCustomer";
    assign("organization", organization.id, lastOwner.get(organization.index) ?? (customer ? null : "sofiaRossi"));
    if (customer) assign("organization", organization.id, "elenaHoffmann");
  }
  for (const contact of data.contacts) {
    set("contact", contact.id, [
      ["jobTitle", text(contact.jobTitle)],
      ["dealRole", options("contact.dealRole", contact.dealRoles)],
      ["leadSource", option("contact.leadSource", contact.leadSource)],
    ]);
    link(
      "contact.organizations",
      "contact",
      contact.id,
      "organization",
      (data.organizations[contact.organizationIndex] as { id: string }).id,
    );
    const organization = data.organizations[contact.organizationIndex];
    const customer = organization?.profile === "legacyCustomer" || organization?.profile === "newCustomer";
    assign("contact", contact.id, lastOwner.get(contact.organizationIndex) ?? (customer ? null : "sofiaRossi"));
    if (customer) assign("contact", contact.id, "elenaHoffmann");
  }
  for (const [index] of data.services.entries()) assign("service", fixtureId("90000000", index + 1), "maxBergmann");
  for (const deal of data.deals) {
    const organization = data.organizations[deal.organizationIndex] as { id: string };
    set("deal", deal.id, [
      ["stage", option("deal.stage", deal.stage)],
      ["dealType", option("deal.dealType", deal.type)],
      ["leadSource", option("deal.leadSource", deal.leadSource)],
      ["lostReason", deal.lostReason ? option("deal.lostReason", deal.lostReason) : null],
      ["openedOn", date(deal.createdAtMs)],
      ["closeDate", date(deal.closeAtMs)],
      ["contractValue", deal.status === "won" ? money(deal.totalValue) : null],
      ["notes", deal.notes ? document(deal.notes) : null],
    ]);
    link("deal.organizations", "deal", deal.id, "organization", organization.id);
    for (const contactIndex of deal.contactIndexes)
      link("deal.contacts", "deal", deal.id, "contact", (data.contacts[contactIndex] as { id: string }).id);
    if (deal.campaignIndex !== null)
      link("deal.campaign", "deal", deal.id, "campaign", (data.campaigns[deal.campaignIndex] as { id: string }).id);
    if (deal.partnerIndex !== null)
      link("deal.partner", "deal", deal.id, "partner", (data.partners[deal.partnerIndex] as { id: string }).id);
    assign("deal", deal.id, deal.ownerKey);
  }
  for (const line of data.lineItems) {
    const deal = data.deals[line.dealIndex];
    record("lineItem", line.id, deal.createdAtMs, northwindAt(deal.createdAtMs));
    set("lineItem", line.id, [
      ["name", text(lineItemName(line.serviceIndex, line.quantity))],
      ["quantity", number(line.quantity)],
      ["pricingMode", { kind: "select", value: line.savedPrice === null ? "live" : "saved" }],
      ["savedPrice", line.savedPrice === null ? null : money(line.savedPrice)],
    ]);
    link("lineItem.deal", "lineItem", line.id, "deal", deal.id);
    link("lineItem.service", "lineItem", line.id, "service", fixtureId("90000000", line.serviceIndex + 1));
  }
  for (const task of data.tasks) {
    set("task", task.id, [
      ["team", option("task.team", task.team)],
      ["dueDate", date(task.dueMs)],
    ]);
    for (const [kind, indexes] of [
      ["contact", task.contactIndexes],
      ["organization", task.organizationIndexes],
      ["deal", task.dealIndexes],
    ] as const) {
      for (const index of indexes)
        link(`task.${kind}s`, "task", task.id, kind, (data[`${kind}s`][index] as { id: string }).id);
    }
    for (const index of task.serviceIndexes)
      link("task.services", "task", task.id, "service", fixtureId("90000000", index + 1));
    assign("task", task.id, task.assigneeKey);
  }

  // Custom lists -------------------------------------------------------------------------------------------------------
  for (const subscription of data.subscriptions) {
    const organization = data.organizations[subscription.organizationIndex] as { id: string };
    record("subscription", subscription.id, subscription.createdAtMs);
    set("subscription", subscription.id, [
      ["name", text(subscription.name)],
      ["plan", option("subscription.plan", subscription.plan)],
      ["billing", option("subscription.billing", subscription.billing)],
      ["seats", number(subscription.seats)],
      ["pricePerSeat", money(subscription.pricePerSeat)],
      ["annualPrice", subscription.annualPrice === null ? null : money(subscription.annualPrice)],
      ["startDate", date(subscription.startMs)],
      ["renewalDate", date(subscription.renewalMs)],
      ["health", option("subscription.health", subscription.health)],
    ]);
    link("subscription.organization", "subscription", subscription.id, "organization", organization.id);
    if (subscription.dealIndex !== null) {
      link(
        "subscription.deal",
        "subscription",
        subscription.id,
        "deal",
        (data.deals[subscription.dealIndex] as { id: string }).id,
      );
    }
    assign("subscription", subscription.id, "elenaHoffmann");
  }
  for (const onboarding of data.onboardings) {
    record("onboarding", onboarding.id, onboarding.createdAtMs);
    set("onboarding", onboarding.id, [
      ["name", text(onboarding.name)],
      ["phase", option("onboarding.phase", onboarding.phase)],
      ["owner", member(onboarding.ownerKey)],
      ["timeline", range(onboarding.startMs, onboarding.endMs)],
      ["progress", number(onboarding.progress)],
    ]);
    link(
      "onboarding.deal",
      "onboarding",
      onboarding.id,
      "deal",
      (data.deals[onboarding.dealIndex] as { id: string }).id,
    );
    link(
      "onboarding.organization",
      "onboarding",
      onboarding.id,
      "organization",
      (data.organizations[onboarding.organizationIndex] as { id: string }).id,
    );
    if (onboarding.subscriptionIndex !== null) {
      link(
        "onboarding.subscription",
        "onboarding",
        onboarding.id,
        "subscription",
        (data.subscriptions[onboarding.subscriptionIndex] as { id: string }).id,
      );
    }
    assign("onboarding", onboarding.id, onboarding.ownerKey);
  }
  for (const ticket of data.tickets) {
    record("ticket", ticket.id, ticket.openedMs);
    set("ticket", ticket.id, [
      ["name", text(ticket.name)],
      ["priority", option("ticket.priority", ticket.priority)],
      ["status", option("ticket.status", ticket.status)],
      ["category", options("ticket.category", ticket.categories)],
      ["assignee", member(ticket.assigneeKey)],
      ["openedOn", date(ticket.openedMs)],
      ["slaDue", date(ticket.slaDueMs)],
      ["lastResponseOn", date(ticket.lastResponseMs)],
      ["resolvedOn", ticket.resolvedMs === null ? null : date(ticket.resolvedMs)],
    ]);
    link(
      "ticket.subscription",
      "ticket",
      ticket.id,
      "subscription",
      (data.subscriptions[ticket.subscriptionIndex] as { id: string }).id,
    );
    link("ticket.contact", "ticket", ticket.id, "contact", (data.contacts[ticket.contactIndex] as { id: string }).id);
    assign("ticket", ticket.id, ticket.assigneeKey);
  }
  for (const campaign of data.campaigns) {
    record("campaign", campaign.id, campaign.startMs - 14 * DAY);
    set("campaign", campaign.id, [
      ["name", text(campaign.name)],
      ["channel", option("campaign.channel", campaign.channel)],
      ["owner", member(campaign.ownerKey)],
      ["budget", money(campaign.budget)],
      ["actualSpend", money(campaign.actualSpend)],
      ["period", range(campaign.startMs, campaign.endMs)],
      ["notes", document(campaign.notes)],
    ]);
    assign("campaign", campaign.id, campaign.ownerKey);
  }
  for (const partner of data.partners) {
    record("partner", partner.id, partner.createdAtMs);
    set("partner", partner.id, [
      ["name", text(partner.name)],
      ["tier", option("partner.tier", partner.tier)],
      ["region", option("partner.region", partner.region)],
      ["website", text(partner.website)],
      ["commissionRate", number(partner.commissionRate)],
      ["annualFee", partner.annualFee ? money(partner.annualFee, "CHF") : null],
    ]);
    assign("partner", partner.id, "sofiaRossi");
  }
  for (const role of data.openRoles) {
    record("openRole", role.id, role.createdAtMs);
    set("openRole", role.id, [
      ["name", text(role.name)],
      ["department", option("openRole.department", role.department)],
      ["status", option("openRole.status", role.status)],
      ["hiringManager", member(role.hiringManagerKey)],
      ["salaryBudget", money(role.salaryBudget)],
      ["targetStart", date(role.targetStartMs)],
    ]);
    assign("openRole", role.id, "lauraFischer");
  }
  for (const candidate of data.candidates) {
    record("candidate", candidate.id, candidate.appliedMs);
    set("candidate", candidate.id, [
      ["name", text(candidate.name)],
      ["stage", option("candidate.stage", candidate.stage)],
      ["source", option("candidate.source", candidate.source)],
      ["email", text(candidate.email)],
      ["appliedOn", date(candidate.appliedMs)],
      ["salaryExpectation", money(candidate.salaryExpectation)],
      ["interviewers", candidate.interviewerKey ? member(candidate.interviewerKey) : null],
      ["interviewNotes", candidate.interviewNotes ? document(candidate.interviewNotes) : null],
    ]);
    link(
      "candidate.openRole",
      "candidate",
      candidate.id,
      "openRole",
      (data.openRoles[candidate.openRoleIndex] as { id: string }).id,
    );
    assign("candidate", candidate.id, "lauraFischer");
  }

  return { records, values, links, assignments };
}

/** Record id prefixes of every list the demo writes, for removing stale fixtures. */
export const NORTHWIND_RECORD_PREFIXES: ReadonlyArray<readonly [typeKey: string, prefix: string]> = [
  ["contact", "60000000-"],
  ["organization", "70000000-"],
  ["deal", "80000000-"],
  ["service", "90000000-"],
  ["task", "a0000000-"],
  ["lineItem", "12000000-"],
  ...Object.entries(NORTHWIND_RECORD_ID_PREFIXES).map(([typeKey, prefix]) => [typeKey, `${prefix}-`] as const),
];

/** Mail, LinkedIn and organization channel identities, as [identity id, type key, record id, provider, value]. */
export function buildNorthwindIdentities() {
  const data = northwindDataset();
  const identities: Array<{
    id: string;
    typeKey: string;
    recordId: string;
    provider: "mail" | "linkedin" | "phone";
    value: string;
  }> = [];
  for (const contact of data.contacts) {
    identities.push({
      id: fixtureId("b0000000", contact.index + 1),
      typeKey: "contact",
      recordId: contact.id,
      provider: "mail",
      value: contact.email,
    });
    if (contact.linkedin) {
      identities.push({
        id: fixtureId("b0000000", 1000 + contact.index + 1),
        typeKey: "contact",
        recordId: contact.id,
        provider: "linkedin",
        value: contact.linkedin,
      });
    }
    identities.push({
      id: fixtureId("b0000000", 3000 + contact.index + 1),
      typeKey: "contact",
      recordId: contact.id,
      provider: "phone",
      value: contact.phone,
    });
  }
  for (const organization of data.organizations) {
    identities.push({
      id: fixtureId("b0000000", 2000 + organization.index + 1),
      typeKey: "organization",
      recordId: organization.id,
      provider: "mail",
      value: `service@${organization.domain}`,
    });
  }
  return identities;
}
