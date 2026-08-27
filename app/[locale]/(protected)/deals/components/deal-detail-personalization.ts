export const DEAL_DETAIL_P13N_ID = "deal-detail";

export const DEAL_DETAIL_FIELD = {
  name: "name",
  totalValue: "totalValue",
  totalQuantity: "totalQuantity",
  weightedValue: "weightedValue",
  contactIds: "contactIds",
  organizationIds: "organizationIds",
  taskIds: "taskIds",
  serviceIds: "serviceIds",
  userIds: "userIds",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const;

export const DEAL_DETAIL_SECTION = {
  base: "base",
  relations: "relations",
  customFields: "customFields",
} as const;
