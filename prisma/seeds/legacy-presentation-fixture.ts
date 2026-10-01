/** Frozen synthetic presentation inputs used to exercise the upgrade mapping. */
export const CONTACT_DETAIL_P13N_ID = "contact-detail";
export const CONTACT_DETAIL_FIELD = {
  firstName: "firstName",
  lastName: "lastName",
  identifiers: "identifiers",
  organizationIds: "organizationIds",
  dealIds: "dealIds",
  taskIds: "taskIds",
  userIds: "userIds",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const;
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
export const SERVICE_DETAIL_P13N_ID = "service-detail";
export const SERVICE_DETAIL_FIELD = {
  name: "name",
  amount: "amount",
  dealIds: "dealIds",
  taskIds: "taskIds",
  userIds: "userIds",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const;
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
