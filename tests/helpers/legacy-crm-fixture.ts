import { randomUUID } from "node:crypto";
import type { ClientBase } from "pg";
import { legacyFixtureWriter } from "./legacy-migration-database";

export const LEGACY_TIMESTAMPS = {
  createdAt: new Date("2025-02-03T10:11:12.345Z"),
  updatedAt: new Date("2026-04-05T06:07:08.901Z"),
};

/**
 * A populated workspace in the legacy CRM schema (before the configurable records migration). The same ID is
 * deliberately reused by a contact, organization, deal, service, task, line item and every link table.
 */
export async function populateLegacyWorkspace(client: ClientBase, { currency = "eur" }: { currency?: string } = {}) {
  const db = legacyFixtureWriter(client);
  const timestamps = LEGACY_TIMESTAMPS;
  const company = await db.company.create({ data: { currency, ...timestamps } });
  const companyId = company.id;
  const adminRole = await db.userRole.create({ data: { companyId, name: "Admin", isSystemRole: true } });
  const memberRole = await db.userRole.create({ data: { companyId, name: "Member", isSystemRole: false } });
  const admin = await db.user.create({
    data: {
      companyId,
      roleId: adminRole.id,
      firstName: "Ada",
      lastName: "Admin",
      status: "active",
      displayLanguage: "de",
      email: `${randomUUID()}@example.test`,
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
    },
  });
  const member = await db.user.create({
    data: {
      companyId,
      roleId: memberRole.id,
      firstName: "Max",
      lastName: "Member",
      status: "active",
      email: `${randomUUID()}@example.test`,
      createdAt: new Date("2021-01-01T00:00:00.000Z"),
    },
  });
  for (const action of ["readAll", "update"])
    await db.rolePermission.create({ data: { companyId, roleId: memberRole.id, resource: "deals", action } });
  await db.rolePermission.create({
    data: { companyId, roleId: memberRole.id, resource: "contacts", action: "readOwn" },
  });

  const shared = randomUUID();
  const contacts = {
    solo: (
      await db.contact.create({
        data: {
          companyId,
          id: shared,
          firstName: "Solo",
          lastName: "",
          notes: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "A retained note" }] }],
          },
          ...timestamps,
        },
      })
    ).id,
    spaced: (
      await db.contact.create({
        data: {
          companyId,
          firstName: " Grace ",
          lastName: " Hopper",
          avatarUrl: "https://example.test/grace.png",
          createdAt: new Date("2022-05-06T07:08:09.123Z"),
        },
      })
    ).id,
    empty: (await db.contact.create({ data: { companyId, firstName: "", lastName: "", notes: null } })).id,
  };
  const organizations = {
    shared: (await db.organization.create({ data: { companyId, id: shared, name: "Shared Org", ...timestamps } })).id,
    other: (await db.organization.create({ data: { companyId, name: "Other Org" } })).id,
  };
  const services = {
    a: (await db.service.create({ data: { companyId, id: shared, name: "A", amount: 1000, ...timestamps } })).id,
    b: (await db.service.create({ data: { companyId, name: "B", amount: 200 } })).id,
    exact: (await db.service.create({ data: { companyId, name: "Exact", amount: 42.175 } })).id,
    binary: (await db.service.create({ data: { companyId, name: "Binary", amount: 0.1 + 0.2 } })).id,
  };
  const deals = {
    weighted: (
      await db.deal.create({
        data: {
          companyId,
          id: shared,
          name: "Weighted",
          totalValue: 2600,
          totalQuantity: 5,
          weightedValue: 1560,
          ...timestamps,
        },
      })
    ).id,
    zero: (await db.deal.create({ data: { companyId, name: "Zero probability" } })).id,
    unstaged: (await db.deal.create({ data: { companyId, name: "No stage" } })).id,
    noWeight: (await db.deal.create({ data: { companyId, name: "Stage without probability" } })).id,
    empty: (await db.deal.create({ data: { companyId, name: "No lines" } })).id,
    exact: (await db.deal.create({ data: { companyId, name: "Exact prices" } })).id,
  };
  const tasks = {
    shared: (await db.task.create({ data: { companyId, id: shared, name: "Task", type: "custom", ...timestamps } })).id,
    protected: (
      await db.task.create({
        data: { companyId, name: "Approve member", type: "userPendingAuthorization", relatedUserId: member.id },
      })
    ).id,
  };
  const lines = {
    weightedA: (
      await db.serviceDeal.create({
        data: { companyId, id: shared, dealId: deals.weighted, serviceId: services.a, quantity: 2, ...timestamps },
      })
    ).id,
    weightedB: (
      await db.serviceDeal.create({ data: { companyId, dealId: deals.weighted, serviceId: services.b, quantity: 3 } })
    ).id,
  };
  for (const dealId of [deals.zero, deals.unstaged, deals.noWeight])
    await db.serviceDeal.create({ data: { companyId, dealId, serviceId: services.b, quantity: 2.5 } });
  await db.serviceDeal.create({ data: { companyId, dealId: deals.exact, serviceId: services.exact, quantity: 3 } });
  await db.serviceDeal.create({ data: { companyId, dealId: deals.exact, serviceId: services.binary, quantity: 10 } });

  for (const [table, source, target, sourceId, targetId] of [
    ["contactOrganization", "contact", "organization", contacts.solo, organizations.shared],
    ["dealContact", "deal", "contact", deals.weighted, contacts.solo],
    ["dealOrganization", "deal", "organization", deals.weighted, organizations.shared],
    ["taskContact", "task", "contact", tasks.shared, contacts.solo],
    ["taskOrganization", "task", "organization", tasks.shared, organizations.shared],
    ["taskDeal", "task", "deal", tasks.shared, deals.weighted],
    ["taskService", "task", "service", tasks.shared, services.a],
  ] as const) {
    await db[table].create({
      data: { companyId, id: shared, [`${source}Id`]: sourceId, [`${target}Id`]: targetId, ...timestamps },
    });
  }
  await db.dealOrganization.create({
    data: { companyId, dealId: deals.weighted, organizationId: organizations.other },
  });
  for (const [table, kind, recordId] of [
    ["contactUser", "contact", contacts.solo],
    ["organizationUser", "organization", organizations.shared],
    ["dealUser", "deal", deals.weighted],
    ["serviceUser", "service", services.a],
    ["taskUser", "task", tasks.shared],
  ] as const) {
    await db[table].create({
      data: { companyId, id: shared, [`${kind}Id`]: recordId, userId: admin.id, ...timestamps },
    });
  }

  const column = async (entityType: string, type: string, label: string, options: unknown) =>
    (await db.customColumn.create({ data: { companyId, entityType, type, label, options, ...timestamps } })).id;
  const columns = {
    stage: await column("deal", "singleSelect", "Stage", {
      options: [
        { value: "proposal", label: "Proposal", color: "blue", index: 0, isDefault: true, weight: 60 },
        { value: "zero", label: "Zero", color: "gray", index: 1, isDefault: false, weight: 0 },
        { value: "open", label: "No probability", color: "gray", index: 2, isDefault: false },
      ],
    }),
    budget: await column("deal", "currency", "  Budget  ", { currency: "usd" }),
    start: await column("deal", "date", "Start", { displayFormat: "dd.MM.yyyy" }),
    window: await column("deal", "dateTimeRange", "Window", {}),
    emails: await column("contact", "email", "Emails", { allowMultiple: true }),
    phone: await column("contact", "phone", "Phone", {}),
    website: await column("organization", "link", "Website", {}),
    sites: await column("organization", "link", "Sites", { allowMultiple: true }),
    priority: await column("task", "singleSelect", "Priority", {
      options: [
        { value: "high", label: "High", color: "red", index: 1, isDefault: false },
        { value: "low", label: "Low", color: "green", index: 0, isDefault: false },
      ],
    }),
    note: await column("service", "plain", "Remark", null),
  };
  await client.query('UPDATE "Company" SET "dealWeightingColumnId" = $2 WHERE id = $1', [companyId, columns.stage]);
  const value = (entityType: string, columnId: string, type: string, recordId: string, raw: string | null) =>
    db.customFieldValue.create({
      data: { companyId, entityType, columnId, type, [`${entityType}Id`]: recordId, value: raw, ...timestamps },
    });
  await value("deal", columns.stage, "singleSelect", deals.weighted, "proposal");
  await value("deal", columns.stage, "singleSelect", deals.zero, "zero");
  await value("deal", columns.stage, "singleSelect", deals.noWeight, "open");
  await value("deal", columns.budget, "currency", deals.weighted, "1234567890.1234567890123456789");
  await value("deal", columns.budget, "currency", deals.zero, "1e3");
  await value("deal", columns.start, "date", deals.weighted, "2026-09-28T12:34:56.123456+02:00");
  await value(
    "deal",
    columns.window,
    "dateTimeRange",
    deals.weighted,
    "2026-09-28T12:34:56.123456+02:00,2026-09-28T16:34:56.654321+02:00",
  );
  await value("contact", columns.emails, "email", contacts.solo, "one@example.test, two@example.test");
  await value("contact", columns.phone, "phone", contacts.solo, null);
  await value("organization", columns.website, "link", organizations.shared, "https://example.test/one");
  await value(
    "organization",
    columns.sites,
    "link",
    organizations.shared,
    "https://example.test/a,https://example.test/b",
  );
  await value("task", columns.priority, "singleSelect", tasks.shared, "high");
  await value("service", columns.note, "plain", services.a, "with, comma");

  const identities = {
    linkedin: (
      await db.contactIdentifier.create({
        data: {
          companyId,
          contactId: contacts.solo,
          provider: "linkedin",
          channelClass: "linkedin",
          value: "person",
          messagingId: "provider-person",
          displayName: "Person",
          profileUrl: "https://linkedin.com/in/person",
          createdAt: new Date("2021-02-03T04:05:06.789Z"),
          updatedAt: new Date("2022-03-04T05:06:07.890Z"),
        },
      })
    ).id,
    email: (
      await db.contactIdentifier.create({
        data: {
          companyId,
          contactId: contacts.spaced,
          provider: "mail",
          channelClass: "email",
          value: "grace@example.test",
        },
      })
    ).id,
  };
  await db.entityTerminology.create({ data: { companyId, entityType: "contact", presetKey: "person" } });

  const account = await db.connectedAccount.create({
    data: { companyId, userId: admin.id, unipileAccountId: randomUUID(), provider: "linkedin" },
  });
  const thread = await db.messagingThread.create({
    data: { companyId, connectedAccountId: account.id, unipileThreadId: randomUUID(), provider: "linkedin" },
  });
  const participants = [
    ["mail", " Person@Example.test "],
    ["whatsapp", "+49 (151) 12345678"],
    ["linkedin", " https://www.linkedin.com/in/Zo%C3%AB/ "],
    ["telegram", "@person"],
    ["linkedin", "opaque%broken"],
    ["mail", "invalid-address"],
    ["linkedin", null],
  ] as const;
  for (const [provider, identifier] of participants) {
    await db.messagingThreadParticipant.create({
      data: { companyId, messagingThreadId: thread.id, provider, providerUserId: randomUUID(), identifier },
    });
  }

  // Presentation state of the legacy list, detail and dashboard surfaces.
  const views = {
    all: (
      await db.dataView.create({
        data: { companyId, userId: admin.id, surfaceKey: "deals-card-store", name: "All", position: 0 },
      })
    ).id,
    board: (
      await db.dataView.create({
        data: {
          companyId,
          userId: admin.id,
          surfaceKey: "deals-card-store",
          name: "My board",
          position: 1,
          filters: [
            { field: "userIds", operator: "in", value: [admin.id] },
            { field: "totalValue", operator: "gt", value: 100 },
            { field: "updatedAt", operator: "notInLastDays", value: 3 },
          ],
          sortDescriptor: { field: "name", direction: "asc" },
          grouping: { field: columns.stage },
          groupingColumnId: columns.stage,
          columnOrder: ["name", columns.stage, "services"],
          hiddenColumns: ["updatedAt"],
          columnWidths: { name: 220.5 },
          viewMode: "card",
          pageSize: 10,
        },
      })
    ).id,
  };
  const preferences = {
    list: (
      await db.p13n.create({
        data: {
          companyId,
          userId: admin.id,
          p13nId: "deals-card-store",
          activeViewKey: views.board,
          columnOrder: ["name"],
          hiddenColumns: [],
          filters: [],
          sortDescriptor: {},
          pagination: { page: 2, pageSize: 25 },
          columnWidths: { name: 180 },
        },
      })
    ).id,
    detail: (
      await db.p13n.create({
        data: {
          companyId,
          userId: admin.id,
          p13nId: "contact-detail",
          columnOrder: ["name", "users"],
          hiddenColumns: [],
          detailOptions: {
            starredFieldIds: ["name"],
            hiddenFieldIds: ["createdAt"],
            collapsedSectionIds: ["relations"],
          },
        },
      })
    ).id,
    timeline: (
      await db.p13n.create({
        data: {
          companyId,
          userId: admin.id,
          p13nId: "entity-timeline",
          filters: [
            { field: "contactIds", operator: "in", value: [contacts.solo] },
            { field: "timelineKind", operator: "in", value: ["changes"] },
          ],
          columnOrder: [],
          hiddenColumns: [],
        },
      })
    ).id,
  };
  const inbox = {
    view: (
      await db.dataView.create({
        data: { companyId, userId: admin.id, surfaceKey: "inbox", name: "Inbox", position: 0 },
      })
    ).id,
    preference: (
      await db.p13n.create({
        data: { companyId, userId: admin.id, p13nId: "inbox", columnOrder: ["subject"], hiddenColumns: [] },
      })
    ).id,
  };
  const widgets = {
    value: (
      await db.widget.create({
        data: {
          companyId,
          userId: admin.id,
          name: "Deal values",
          kind: "chart",
          entityType: "deal",
          aggregationType: "dealValue",
          groupByType: "customColumn",
          groupByCustomColumnId: columns.stage,
          displayOptions: { displayType: "horizontalBarChart", showLegend: false },
          layout: { lg: { i: "a", x: 0, y: 0, w: 6, h: 7 } },
        },
      })
    ).id,
    quantity: (
      await db.widget.create({
        data: {
          companyId,
          userId: admin.id,
          name: "Service quantities",
          kind: "chart",
          entityType: "service",
          aggregationType: "dealQuantity",
          groupByType: "service",
          entityFilters: [{ field: "name", operator: "equals", value: "A" }],
        },
      })
    ).id,
    activity: (
      await db.widget.create({
        data: {
          companyId,
          userId: admin.id,
          name: "History",
          kind: "activityTimeline",
          timelineFilters: [
            { field: "contactIds", operator: "in", value: [contacts.solo] },
            { field: "timelineKind", operator: "in", value: ["changes", "activities"] },
          ],
        },
      })
    ).id,
  };
  const routine = (
    await db.routine.create({
      data: {
        companyId,
        ownerUserId: admin.id,
        name: "Watch names",
        prompt: "Inspect changes.",
        triggerKind: "event",
        triggerEvents: ["contact.updated", "messaging.message.received"],
        changedFields: ["firstName", columns.emails],
        triggerFilters: [{ field: "lastName", operator: "isNotNull" }],
      },
    })
  ).id;
  const run = (
    await db.routineRun.create({
      data: {
        companyId,
        routineId: routine,
        executedByUserId: admin.id,
        executedByName: "Ada Admin",
        triggerKind: "event",
        triggerEvent: "contact.updated",
        triggerEntityId: contacts.solo,
        triggerPayload: { companyId, entityId: contacts.solo },
        scheduledFor: timestamps.updatedAt,
      },
    })
  ).id;
  const webhook = (
    await db.webhook.create({
      data: {
        companyId,
        url: "https://receiver.example.test/legacy",
        events: ["deal.updated", "contact.created", "messaging.message.received"],
        enabled: true,
      },
    })
  ).id;
  await db.auditLog.create({
    data: { companyId, userId: admin.id, entityId: webhook, event: "webhook.created", eventData: {} },
  });
  const history = (
    await db.auditLog.create({
      data: { companyId, userId: admin.id, entityId: contacts.solo, event: "contact.updated", eventData: {} },
    })
  ).id;
  const delivery = (
    await db.webhookDelivery.create({
      data: {
        companyId,
        url: "https://receiver.example.test/legacy",
        event: "contact.created",
        requestBody: {},
        status: "success",
      },
    })
  ).id;

  return {
    companyId,
    admin,
    member,
    adminRole,
    memberRole,
    shared,
    contacts,
    organizations,
    services,
    deals,
    tasks,
    lines,
    columns,
    identities,
    thread,
    participants,
    views,
    preferences,
    inbox,
    widgets,
    routine,
    run,
    webhook,
    history,
    delivery,
    db,
  };
}

export type LegacyWorkspace = Awaited<ReturnType<typeof populateLegacyWorkspace>>;

/** Empty and null variants of the legacy column options and notes, and a scheduled routine with leftover legacy events. */
export async function addEmptyLegacyStates(client: ClientBase, f: LegacyWorkspace) {
  const { companyId } = f;
  const json = (value: string) => ({ toPostgres: () => value });
  const raw = async (table: string, values: Record<string, unknown>) => {
    const row: Record<string, unknown> = { id: randomUUID(), companyId, updatedAt: new Date(), ...values };
    const keys = Object.keys(row);
    await client.query(
      `INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(",")}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(",")})`,
      keys.map((key) => {
        const value = row[key];
        return value && typeof value === "object" && "toPostgres" in value
          ? (value as { toPostgres: () => string }).toPostgres()
          : value;
      }),
    );
    return row.id as string;
  };
  const scheduled = await raw("Routine", {
    ownerUserId: f.admin.id,
    name: "Scheduled",
    prompt: "Inspect.",
    triggerKind: "schedule",
    cronExpression: "0 9 * * *",
    triggerEvents: ["deal.created", "messaging.message.received"],
    changedFields: ["name"],
    triggerFilters: json("[]"),
  });
  const columns = {
    nullOptions: await raw("CustomColumn", {
      entityType: "service",
      type: "plain",
      label: "No options",
      options: null,
    }),
    jsonNullOptions: await raw("CustomColumn", {
      entityType: "service",
      type: "email",
      label: "JSON null options",
      options: json("null"),
    }),
    emptyOptions: await raw("CustomColumn", {
      entityType: "task",
      type: "plain",
      label: "Empty options",
      options: json("{}"),
    }),
    noChoices: await raw("CustomColumn", {
      entityType: "task",
      type: "singleSelect",
      label: "No choices",
      options: json('{"options":[]}'),
    }),
  };
  const notes = {
    emptyObject: await raw("Organization", { name: "Empty note", notes: json("{}") }),
    jsonNull: await raw("Organization", { name: "JSON null note", notes: json("null") }),
  };
  return { scheduled, columns, notes };
}
