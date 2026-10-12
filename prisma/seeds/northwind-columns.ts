import { presetId } from "@/features/records/crm-preset";

import type { CustomFieldSeedData } from "./custom-fields";
import {
  NORTHWIND_ARCHIVED_FIELD_KEYS,
  NORTHWIND_FIELD_KEYS,
  NORTHWIND_PATH_KEYS,
  NORTHWIND_RELATIONSHIP_KEYS,
  type NorthwindTypeKey,
} from "./northwind-model";

type ListKey = Exclude<NorthwindTypeKey, "lineItem">;

/** Starter relationships as `[presetId key, source list, target list]`. */
const STARTER_RELATIONSHIPS = [
  ["contact.organizations", "contact", "organization"],
  ["deal.contacts", "deal", "contact"],
  ["deal.organizations", "deal", "organization"],
  ["lineItem.deal", "lineItem", "deal"],
  ["lineItem.service", "lineItem", "service"],
  ["task.contacts", "task", "contact"],
  ["task.organizations", "task", "organization"],
  ["task.deals", "task", "deal"],
  ["task.services", "task", "service"],
] as const;

/** Relationship paths per list (starter and Northwind). */
const PATHS: Partial<Record<ListKey, string[]>> = {
  deal: ["deal.services.path"],
  service: ["service.deals.path"],
  organization: [NORTHWIND_PATH_KEYS.organizationProducts, NORTHWIND_PATH_KEYS.organizationTickets],
};

/**
 * Column keys of the Northwind lists, so saved views can show a curated set and hide the rest. A list's
 * columns are its fields (starter, the seed's earlier custom fields, and the Northwind fields), the system
 * columns, a column per relationship end and one per relationship path. The primary name is never hidden.
 */
export function northwindColumns(companyId: string, legacy: CustomFieldSeedData["customFieldIds"]) {
  const id = (key: string) => presetId(companyId, key);
  const rel = (key: string, direction: "outgoing" | "incoming") => `relationship:${id(key)}:${direction}`;
  const path = (key: string) => `path:${id(key)}`;

  const starterFields: Record<ListKey, string[]> = {
    contact: [
      id("contact.firstName"),
      id("contact.lastName"),
      id("contact.avatarUrl"),
      id("capability.identity"),
      legacy.contactPhone,
      legacy.contactSalesPipeline,
    ],
    organization: [legacy.organizationType, legacy.organizationWebsite],
    deal: [
      id("deal.totalValue"),
      id("deal.totalQuantity"),
      id("deal.weightedValue"),
      legacy.dealStatus,
      legacy.dealProjectPeriod,
    ],
    service: [id("service.amount"), legacy.serviceType, legacy.servicePricing],
    task: [legacy.taskPriority, legacy.taskStatus],
    subscription: [],
    onboarding: [],
    ticket: [],
    campaign: [],
    partner: [],
    openRole: [],
    candidate: [],
  };

  const relationships: Array<readonly [string, string, string]> = [
    ...STARTER_RELATIONSHIPS,
    ...Object.values(NORTHWIND_RELATIONSHIP_KEYS).map((key) => {
      const [source, target] = key.split(".");
      return [key, source, target] as const;
    }),
  ];

  const all = (type: ListKey): string[] => {
    const northwind = (NORTHWIND_FIELD_KEYS as Partial<Record<ListKey, Record<string, string>>>)[type] ?? {};
    return [
      ...starterFields[type],
      ...Object.values(northwind)
        .filter((key) => !NORTHWIND_ARCHIVED_FIELD_KEYS.includes(key))
        .map(id),
      ...relationships.flatMap(([key, source, target]) => [
        ...(source === type ? [rel(key, "outgoing")] : []),
        ...(target === type ? [rel(key, "incoming")] : []),
      ]),
      ...(PATHS[type] ?? []).map(path),
      "system:assignedTo",
      "system:createdAt",
      "system:updatedAt",
    ].filter((column) => column !== id(`${type}.name`));
  };

  return {
    id,
    rel,
    path,
    all,
    /** Hidden columns for a view that shows only `visible` (plus the name). */
    showOnly: (type: ListKey, visible: readonly string[]) => all(type).filter((column) => !visible.includes(column)),
  };
}
