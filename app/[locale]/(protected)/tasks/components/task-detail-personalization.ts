export const TASK_DETAIL_P13N_ID = "task-detail";

export const TASK_DETAIL_FIELD = {
  name: "name",
  contactIds: "contactIds",
  organizationIds: "organizationIds",
  dealIds: "dealIds",
  serviceIds: "serviceIds",
  userIds: "userIds",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const;

export const TASK_DETAIL_SECTION = {
  base: "base",
  relations: "relations",
  customFields: "customFields",
} as const;
