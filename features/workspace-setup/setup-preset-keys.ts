export const SETUP_PRESET_LISTS = ["contact", "organization", "deal", "service", "task", "lineItem"] as const;
export type SetupPresetList = (typeof SETUP_PRESET_LISTS)[number];

export const SETUP_PRESET_FIELDS: Readonly<Record<string, string>> = {
  "contact.name": "contact.name",
  "contact.notes": "contact.notes",
  "contact.firstName": "contact.firstName",
  "contact.lastName": "contact.lastName",
  "contact.avatarUrl": "contact.avatarUrl",
  "contact.channels": "capability.identity",
  "contact.status": "contact.status",
  "organization.name": "organization.name",
  "organization.notes": "organization.notes",
  "deal.name": "deal.name",
  "deal.notes": "deal.notes",
  "deal.stage": "deal.stage",
  "deal.totalValue": "deal.totalValue",
  "deal.totalQuantity": "deal.totalQuantity",
  "deal.weightedValue": "deal.weightedValue",
  "service.name": "service.name",
  "service.notes": "service.notes",
  "service.amount": "service.amount",
  "task.name": "task.name",
  "task.notes": "task.notes",
  "task.status": "task.status",
  "lineItem.name": "lineItem.name",
  "lineItem.notes": "lineItem.notes",
  "lineItem.quantity": "lineItem.quantity",
  "lineItem.pricingMode": "lineItem.pricingMode",
  "lineItem.savedPrice": "lineItem.savedPrice",
  "lineItem.effectivePrice": "lineItem.effectivePrice",
  "lineItem.amount": "lineItem.amount",
};

export const SETUP_PRESET_RELATIONSHIPS = [
  "contact.organizations",
  "deal.contacts",
  "deal.organizations",
  "task.contacts",
  "task.organizations",
  "task.deals",
  "task.services",
  "lineItem.deal",
  "lineItem.service",
] as const;

export function isSetupPresetList(key: string): key is SetupPresetList {
  return (SETUP_PRESET_LISTS as readonly string[]).includes(key);
}

export function isSetupPresetField(ref: string): boolean {
  return Object.hasOwn(SETUP_PRESET_FIELDS, ref);
}

export function isSetupPresetRelationship(ref: string): boolean {
  return (SETUP_PRESET_RELATIONSHIPS as readonly string[]).includes(ref);
}
