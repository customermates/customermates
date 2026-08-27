export const ORGANIZATION_DETAIL_P13N_ID = "organization-detail";

export const ORGANIZATION_DETAIL_FIELD = {
  name: "name",
  contactIds: "contactIds",
  dealIds: "dealIds",
  taskIds: "taskIds",
  userIds: "userIds",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const;

export const ORGANIZATION_DETAIL_SECTION = {
  base: "base",
  relations: "relations",
  customFields: "customFields",
} as const;
