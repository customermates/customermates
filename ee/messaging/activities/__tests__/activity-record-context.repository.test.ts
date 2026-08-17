import { describe, it, expect, beforeEach, vi } from "vitest";

import { Action, EntityType, Resource } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { DomainEvent } from "@/features/event/domain-events";

const { fake } = vi.hoisted(() => {
  const calls: Record<string, { op: string; args: any }[]> = {
    auditLog: [],
    messagingMessage: [],
    accountActivity: [],
    calendarEvent: [],
    connectedAccount: [],
    contactIdentifier: [],
    contact: [],
    organization: [],
    deal: [],
    service: [],
    task: [],
  };

  const rows: Record<string, any[]> = {
    auditLog: [],
    accountActivity: [],
    calendarEvent: [],
    contact: [],
    contactIdentifier: [],
    organization: [],
    deal: [],
    service: [],
    task: [],
    messagingMessage: [],
  };

  const model = (name: string) => ({
    findMany: (args: any) => {
      calls[name].push({ op: "findMany", args });
      return Promise.resolve(rows[name] ?? []);
    },
    count: (args: any) => {
      calls[name].push({ op: "count", args });
      return Promise.resolve(0);
    },
  });

  return {
    fake: {
      calls,
      rows,
      reset() {
        for (const key of Object.keys(calls)) calls[key].length = 0;
        for (const key of Object.keys(rows)) rows[key].length = 0;
      },
      prisma: {
        auditLog: model("auditLog"),
        messagingMessage: model("messagingMessage"),
        accountActivity: model("accountActivity"),
        calendarEvent: model("calendarEvent"),
        connectedAccount: model("connectedAccount"),
        contact: model("contact"),
        contactIdentifier: model("contactIdentifier"),
        organization: model("organization"),
        deal: model("deal"),
        service: model("service"),
        task: model("task"),
      },
    },
  };
});

vi.mock("@/prisma/db", () => ({ prisma: fake.prisma }));
vi.mock("@/core/di", () => ({
  getContactRepo: () => ({}),
  getCustomColumnRepo: () => ({ getCustomColumns: () => Promise.resolve([]) }),
}));

import { PrismaActivitiesRepo } from "../prisma-activities.repository";

function messagingRepo() {
  const repo = new PrismaActivitiesRepo();
  repo.setMessagingSourcesEnabled(true);
  return repo;
}

const actor = {
  id: "u1",
  firstName: "Max",
  lastName: "Bergmann",
  avatarUrl: null,
  email: "max@example.com",
};

function auditRow(id: string, event: DomainEvent, entityId: string | null) {
  return {
    id,
    event,
    eventData: null,
    entityId,
    createdAt: new Date(0),
    user: actor,
  };
}

const auditReader = () =>
  createMockUserWithPermissions([
    { resource: Resource.auditLog, action: Action.readAll },
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.organizations, action: Action.readAll },
    { resource: Resource.deals, action: Action.readAll },
    { resource: Resource.services, action: Action.readAll },
    { resource: Resource.tasks, action: Action.readAll },
  ]);

async function getItems(user = auditReader()) {
  return runWithTenant(user, () => messagingRepo().getItems({}));
}

const activityReader = () =>
  createMockUserWithPermissions([
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readAll },
  ]);

function messageRow(id: string, contactId: string) {
  const participant = {
    contact: { id: contactId },
    displayName: "Anna Müller",
    identifier: "anna.mueller@roche.example",
    isSelf: false,
  };

  return {
    id,
    attachmentsMeta: [],
    bodyHtml: null,
    bodyText: "Hello",
    connectedAccountId: "account-1",
    direction: "inbound",
    editedAt: null,
    folderIds: [],
    isDeleted: false,
    isDraft: false,
    isEvent: false,
    isHidden: false,
    origin: "external",
    provider: "google",
    reactions: [],
    recipients: { to: [], cc: [], bcc: [] },
    sender: participant,
    sentAt: new Date(0),
    subject: null,
    thread: {
      id: "thread-1",
      name: null,
      participants: [participant],
      provider: "google",
      subject: "Hello",
      type: "single",
    },
  };
}

function calendarRow(id: string, emails: string[]) {
  return {
    id,
    allDay: false,
    attendeeEmails: emails,
    attendees: [],
    conferenceUrl: null,
    connectedAccount: { provider: "google" },
    description: null,
    endsAt: new Date(60_000),
    location: null,
    organizer: null,
    startsAt: new Date(0),
    status: "confirmed",
    title: "Planning",
  };
}

describe("record context on audit entries", () => {
  beforeEach(() => fake.reset());

  it("resolves the affected record and attaches it as the primary", async () => {
    fake.rows.auditLog.push(auditRow("a1", DomainEvent.DEAL_UPDATED, "d1"));
    fake.rows.deal.push({ id: "d1", name: "Acme renewal" });

    const [entry] = await getItems();

    expect(entry.records.primary).toEqual({
      entityType: EntityType.deal,
      id: "d1",
      label: "Acme renewal",
      avatarUrl: null,
    });
    expect(entry.records.related).toEqual([]);
    expect(entry.records.relatedOverflow).toBe(0);
  });

  it("issues one query per entity type rather than one per row", async () => {
    for (let i = 0; i < 12; i++) fake.rows.auditLog.push(auditRow(`a${i}`, DomainEvent.DEAL_UPDATED, `d${i}`));
    fake.rows.auditLog.push(auditRow("c-row", DomainEvent.CONTACT_UPDATED, "c1"));

    await getItems();

    expect(fake.calls.deal.filter((c) => c.op === "findMany")).toHaveLength(1);
    expect(fake.calls.contact.filter((c) => c.op === "findMany")).toHaveLength(1);
    expect(fake.calls.deal[0].args.where.id.in).toHaveLength(12);
  });

  it("does not query an entity type no row referenced", async () => {
    fake.rows.auditLog.push(auditRow("a1", DomainEvent.DEAL_UPDATED, "d1"));

    await getItems();

    expect(fake.calls.organization).toHaveLength(0);
    expect(fake.calls.service).toHaveLength(0);
    expect(fake.calls.task).toHaveLength(0);
  });

  it("scopes the label lookup to what the viewer may read", async () => {
    fake.rows.auditLog.push(auditRow("a1", DomainEvent.DEAL_UPDATED, "d1"));

    await getItems();

    expect(fake.calls.deal[0].args.where).toHaveProperty("companyId");
  });

  it("drops a ref the viewer cannot read rather than leaking its label", async () => {
    fake.rows.auditLog.push(auditRow("a1", DomainEvent.DEAL_UPDATED, "d1"));

    const [entry] = await getItems();

    expect(entry.records.primary).toBeNull();
  });

  it("gives no record context to an event whose subject is not a crm record", async () => {
    fake.rows.auditLog.push(auditRow("a1", DomainEvent.ROLE_UPDATED, "r1"));

    const [entry] = await getItems();

    expect(entry.records.primary).toBeNull();
    expect(fake.calls.contact).toHaveLength(0);
    expect(fake.calls.deal).toHaveLength(0);
  });

  it("never treats a messaging event's entityId as a crm record", async () => {
    fake.rows.auditLog.push(auditRow("a1", DomainEvent.MESSAGING_MESSAGE_RECEIVED, "connected-account-1"));

    const [entry] = await getItems();

    expect(entry.records.primary).toBeNull();
    expect(fake.calls.contact).toHaveLength(0);
  });

  it("tolerates an audit row with no entity id", async () => {
    fake.rows.auditLog.push(auditRow("a1", DomainEvent.DEAL_UPDATED, null));

    const [entry] = await getItems();

    expect(entry.records.primary).toBeNull();
    expect(fake.calls.deal).toHaveLength(0);
  });

  it("resolves several entity types in one pass", async () => {
    fake.rows.auditLog.push(auditRow("a1", DomainEvent.DEAL_UPDATED, "d1"));
    fake.rows.auditLog.push(auditRow("a2", DomainEvent.TASK_CREATED, "t1"));
    fake.rows.deal.push({ id: "d1", name: "Acme renewal" });
    fake.rows.task.push({ id: "t1", name: "Send quote" });

    const entries = await getItems();
    const labels = entries.map((e) => e.records.primary?.label);

    expect(labels).toContain("Acme renewal");
    expect(labels).toContain("Send quote");
  });
});

describe("record option labels", () => {
  beforeEach(() => fake.reset());

  it("batches each represented type without pagination and preserves input order", async () => {
    fake.rows.contact.push(
      { id: "c1", firstName: "Ada", lastName: "Lovelace", avatarUrl: "https://example.test/ada.png" },
      { id: "c2", firstName: "Grace", lastName: "Hopper", avatarUrl: null },
    );
    fake.rows.deal.push({ id: "d1", name: "Renewal" });

    const result = await runWithTenant(auditReader(), () =>
      new PrismaActivitiesRepo().listRecordOptions({
        records: [
          { entityType: EntityType.contact, ids: ["c2", "c1"] },
          { entityType: EntityType.deal, ids: ["d1"] },
        ],
      }),
    );

    expect(result).toEqual([
      { entityType: EntityType.contact, id: "c2", label: "Grace Hopper", avatarUrl: null },
      { entityType: EntityType.contact, id: "c1", label: "Ada Lovelace", avatarUrl: "https://example.test/ada.png" },
      { entityType: EntityType.deal, id: "d1", label: "Renewal", avatarUrl: null },
    ]);
    expect(fake.calls.contact).toHaveLength(1);
    expect(fake.calls.deal).toHaveLength(1);
    expect(fake.calls.contact[0].args.where.id.in).toEqual(["c2", "c1"]);
    expect(fake.calls.contact[0].args).not.toHaveProperty("take");
    expect(fake.calls.contact[0].args).not.toHaveProperty("skip");
  });

  it("uses read-own predicates for selected labels", async () => {
    const user = createMockUserWithPermissions([{ resource: Resource.contacts, action: Action.readOwn }]);

    await runWithTenant(user, () =>
      new PrismaActivitiesRepo().listRecordOptions({
        records: [{ entityType: EntityType.contact, ids: ["c1"] }],
      }),
    );

    expect(fake.calls.contact[0].args.where).toEqual({
      id: { in: ["c1"] },
      companyId: user.companyId,
      users: { some: { userId: user.id } },
    });
  });

  it("fails closed when the viewer has no permission for a selected record type", async () => {
    const user = createMockUserWithPermissions([]);

    await runWithTenant(user, () =>
      new PrismaActivitiesRepo().listRecordOptions({
        records: [{ entityType: EntityType.contact, ids: ["c1"] }],
      }),
    );

    expect(fake.calls.contact[0].args.where).toEqual({
      id: { in: [] },
      companyId: user.companyId,
    });
  });
});

describe("record context on messaging entries", () => {
  beforeEach(() => fake.reset());

  it("uses the linked sender on a message", async () => {
    fake.rows.messagingMessage.push(messageRow("m1", "c1"));
    fake.rows.contact.push({ id: "c1", firstName: "Anna", lastName: "Müller", avatarUrl: "https://cdn/anna.png" });

    const [entry] = await getItems(activityReader());

    expect(entry.records.primary).toEqual({
      entityType: EntityType.contact,
      id: "c1",
      label: "Anna Müller",
      avatarUrl: "https://cdn/anna.png",
    });
  });

  it("resolves an account activity through a provider messaging id", async () => {
    fake.rows.accountActivity.push({
      id: "activity-1",
      connectedAccount: { provider: "linkedin" },
      identifier: "demo-linkedin-leon",
      occurredAt: new Date(0),
      payload: {},
    });
    fake.rows.contactIdentifier.push({
      contactId: "c1",
      messagingId: "demo-linkedin-leon",
      provider: "linkedin",
      value: "leon-becker.linkedin.example",
    });
    fake.rows.contact.push({ id: "c1", firstName: "Leon", lastName: "Becker" });

    const [entry] = await getItems(activityReader());

    expect(entry.records.primary?.label).toBe("Leon Becker");
  });

  it("attaches each permitted calendar attendee once", async () => {
    fake.rows.calendarEvent.push(calendarRow("event-1", ["anna@example.com", "amin@example.com", "anna@example.com"]));
    fake.rows.contactIdentifier.push(
      {
        contactId: "c1",
        messagingId: null,
        provider: "google",
        value: "anna@example.com",
      },
      {
        contactId: "c2",
        messagingId: null,
        provider: "mail",
        value: "amin@example.com",
      },
    );
    fake.rows.contact.push(
      { id: "c1", firstName: "Anna", lastName: "Müller" },
      { id: "c2", firstName: "Amin", lastName: "Hassan" },
    );

    const [entry] = await getItems(activityReader());

    expect([entry.records.primary, ...entry.records.related].map((record) => record?.id)).toEqual(["c1", "c2"]);
  });

  it("does not cross-link equal identifiers from different channel classes", async () => {
    fake.rows.accountActivity.push({
      id: "activity-1",
      connectedAccount: { provider: "linkedin" },
      identifier: "collision",
      occurredAt: new Date(0),
      payload: {},
    });
    fake.rows.contactIdentifier.push(
      {
        contactId: "email-contact",
        messagingId: null,
        provider: "google",
        value: "collision",
      },
      {
        contactId: "linkedin-contact",
        messagingId: "collision",
        provider: "linkedin",
        value: "profile",
      },
    );
    fake.rows.contact.push(
      { id: "email-contact", firstName: "Email", lastName: "Contact" },
      { id: "linkedin-contact", firstName: "LinkedIn", lastName: "Contact" },
    );

    const [entry] = await getItems(activityReader());

    expect(entry.records.primary?.id).toBe("linkedin-contact");
  });

  it("drops a resolved messaging ref when its record is inaccessible", async () => {
    fake.rows.accountActivity.push({
      id: "activity-1",
      connectedAccount: { provider: "linkedin" },
      identifier: "demo-linkedin-leon",
      occurredAt: new Date(0),
      payload: {},
    });
    fake.rows.contactIdentifier.push({
      contactId: "c1",
      messagingId: "demo-linkedin-leon",
      provider: "linkedin",
      value: "profile",
    });

    const [entry] = await getItems(activityReader());

    expect(entry.records.primary).toBeNull();
  });
});
