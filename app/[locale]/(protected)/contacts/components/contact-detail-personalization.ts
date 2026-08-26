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

export const CONTACT_DETAIL_SECTION = {
  base: "base",
  relations: "relations",
  customFields: "customFields",
} as const;
