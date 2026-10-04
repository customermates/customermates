import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { presetId } from "@/features/records/crm-preset";

const LEGACY_TYPES = ["contact", "organization", "deal", "service", "task"] as const;

export const timestamps = { createdAt: "2023-01-02T03:04:05.123Z", updatedAt: "2024-02-03T04:05:06.456Z" };

/** A legacy workspace with saved views, personalisation and dashboard widgets on every legacy surface. */
export async function presentationFixture(
  client: Client,
  probability: 60 | 0 | null = 60,
  onCreate?: (companyId: string) => void,
) {
  const companyId = randomUUID();
  const recordId = randomUUID();
  const insert = async (table: string, values: Record<string, unknown>) => {
    const data = { id: randomUUID(), companyId, ...timestamps, ...values };
    const keys = Object.keys(data);
    await client.query(
      `INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(", ")}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(", ")})`,
      Object.values(data),
    );
    return data.id;
  };
  await client.query('INSERT INTO "Company" (id, "updatedAt") VALUES ($1, NOW())', [companyId]);
  onCreate?.(companyId);
  const roleId = await insert("UserRole", { name: "Administrator", isSystemRole: true });
  const userId = await insert("User", {
    roleId,
    firstName: "Synthetic",
    lastName: "Migration",
    email: `${randomUUID()}@example.test`,
    status: "active",
  });
  await insert("Contact", { id: recordId, firstName: "Synthetic", lastName: "Person" });
  await insert("Organization", { id: recordId, name: "Organization A" });
  const organizationB = await insert("Organization", { name: "Organization B" });
  await insert("Service", { id: recordId, name: "A", amount: 1000 });
  const serviceB = await insert("Service", { name: "B", amount: 200 });
  await insert("Task", { id: recordId, name: "Synthetic task", type: "custom" });
  const fields = new Map<string, string>();
  for (const kind of LEGACY_TYPES) {
    const fieldId = await insert("CustomColumn", {
      label: "Status",
      type: "singleSelect",
      entityType: kind,
      options: JSON.stringify({
        options: [
          {
            value: "open",
            label: "Open",
            color: "blue",
            index: 0,
            isDefault: false,
            ...(kind === "deal" && probability !== null ? { weight: probability } : {}),
          },
        ],
      }),
    });
    fields.set(kind, fieldId);
  }
  await client.query('UPDATE "Company" SET "dealWeightingColumnId" = $2 WHERE id = $1', [
    companyId,
    fields.get("deal"),
  ]);
  const otherDeal = randomUUID();
  for (const dealId of [recordId, otherDeal]) {
    await insert("Deal", {
      id: dealId,
      name: "Synthetic deal",
      totalValue: 2600,
      totalQuantity: 5,
      weightedValue: probability === null ? null : (2600 * probability) / 100,
    });
    await insert("ServiceDeal", {
      ...(dealId === recordId ? { id: recordId } : {}),
      dealId,
      serviceId: recordId,
      quantity: 2,
    });
    await insert("ServiceDeal", { dealId, serviceId: serviceB, quantity: 3 });
    await insert("DealContact", { dealId, contactId: recordId });
    for (const organizationId of [recordId, organizationB])
      await insert("DealOrganization", { dealId, organizationId });
    await insert("CustomFieldValue", {
      entityType: "deal",
      dealId,
      columnId: fields.get("deal"),
      type: "singleSelect",
      value: "open",
    });
  }
  await insert("ContactOrganization", { contactId: recordId, organizationId: recordId });
  const views = new Map<string, string[]>();
  const preferences = new Map<string, string>();
  const details = new Map<string, string>();
  for (const kind of LEGACY_TYPES) {
    const surfaceKey = `${kind}s-card-store`;
    const all = await insert("DataView", { userId, surfaceKey, name: "All", position: 0 });
    const custom = await insert("DataView", {
      userId,
      surfaceKey,
      name: "My board",
      position: 1,
      filters: JSON.stringify([{ field: "userIds", operator: "in", value: [userId] }]),
      sortDescriptor: JSON.stringify({ field: "name", direction: "asc" }),
      grouping: JSON.stringify({ field: fields.get(kind) }),
      groupingColumnId: fields.get(kind),
      columnOrder: JSON.stringify(["name", fields.get(kind)]),
      hiddenColumns: JSON.stringify(["updatedAt"]),
      columnWidths: JSON.stringify({ name: 220 }),
      viewMode: "card",
      pageSize: 10,
    });
    const cleared = await insert("DataView", {
      userId,
      surfaceKey,
      name: "Explicit empty",
      position: 2,
      filters: "[]",
      sortDescriptor: "{}",
      columnOrder: "[]",
      hiddenColumns: "[]",
      columnWidths: "{}",
      viewMode: "table",
      pageSize: 25,
    });
    views.set(kind, [all, custom, cleared]);
    preferences.set(
      kind,
      await insert("P13n", {
        userId,
        p13nId: surfaceKey,
        activeViewKey: custom,
        columnOrder: ["name"],
        hiddenColumns: [],
        filters: "[]",
        sortDescriptor: "{}",
        pagination: JSON.stringify({ page: 2, pageSize: 10 }),
        columnWidths: JSON.stringify({ name: 180 }),
      }),
    );
    details.set(
      kind,
      await insert("P13n", {
        userId,
        p13nId: `${kind}-detail`,
        columnOrder: ["name", "users"],
        hiddenColumns: [],
        detailOptions: JSON.stringify({
          starredFieldIds: ["name"],
          hiddenFieldIds: ["createdAt"],
          collapsedSectionIds: ["relations"],
        }),
      }),
    );
  }
  const systemView = await insert("DataView", { userId, surfaceKey: "inbox", name: "Inbox", filters: "[]" });
  const systemPreference = await insert("P13n", {
    userId,
    p13nId: "inbox",
    columnOrder: ["subject"],
    hiddenColumns: [],
  });
  const widget = async (name: string, values: Record<string, unknown> = {}) =>
    insert("Widget", {
      userId,
      name,
      kind: "chart",
      entityType: "deal",
      aggregationType: "dealValue",
      groupByType: "none",
      displayOptions: JSON.stringify({
        displayType: "horizontalBarChart",
        showLegend: false,
        reverseXAxis: true,
        barColors: ["primary1"],
      }),
      layout: JSON.stringify({ lg: { i: recordId, x: 1, y: 2, w: 4, h: 5 } }),
      ...values,
    });
  const widgets = {
    deals: await widget("Deal values"),
    weighted: await widget("Weighted values", { aggregationType: "dealWeightedValue" }),
    organizations: await widget("Organization values", { entityType: "organization", groupByType: "organization" }),
    quantity: await widget("Service quantities", {
      entityType: "service",
      aggregationType: "dealQuantity",
      groupByType: "service",
    }),
    amount: await widget("Service values", { entityType: "service", groupByType: "service" }),
    filtered: await widget("Only service A", {
      entityType: "service",
      groupByType: "service",
      entityFilters: JSON.stringify([{ field: "name", operator: "equals", value: "A" }]),
    }),
    activity: await insert("Widget", {
      userId,
      name: "History",
      kind: "activityTimeline",
      timelineFilters: JSON.stringify([{ field: "contactIds", operator: "in", value: [recordId] }]),
    }),
  };
  const read = async (table: string, id: string) =>
    (
      await client.query(`SELECT to_jsonb(item) AS data FROM "${table}" item WHERE "companyId" = $1 AND id = $2`, [
        companyId,
        id,
      ])
    ).rows[0]?.data as Record<string, unknown> | undefined;
  return {
    client,
    companyId,
    roleId,
    userId,
    recordId,
    otherDeal,
    serviceB,
    organizationB,
    fields,
    views,
    preferences,
    details,
    widgets,
    systemView,
    systemPreference,
    insert,
    read,
    id: (key: string) => presetId(companyId, key),
  };
}
