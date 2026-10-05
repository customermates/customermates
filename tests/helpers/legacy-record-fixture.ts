import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { presetId } from "@/features/records/crm-preset";

const LEGACY_TYPES = ["contact", "organization", "deal", "service", "task"] as const;

export const timestamps = { createdAt: "2023-01-02T03:04:05.123Z", updatedAt: "2024-02-03T04:05:06.456Z" };

/** A legacy workspace with records, a weighting stage, line items and links on every legacy type. */
export async function legacyRecordFixture(
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
    insert,
    id: (key: string) => presetId(companyId, key),
  };
}
