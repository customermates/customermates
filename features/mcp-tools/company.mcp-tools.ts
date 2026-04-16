import { z } from "zod";

import { encodeToToon } from "./utils";

import { getGetCompanyDetailsInteractor, getGetRolesInteractor } from "@/core/di";

export const getCompanyDetailsTool = {
  name: "get_company_details",
  description: "Get company information including name, address, and settings.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({}),
  execute: async () => {
    const result = await getGetCompanyDetailsInteractor().invoke();
    const company = result.data;
    return encodeToToon({
      id: company.id,
      name: company.name,
      street: company.street,
      city: company.city,
      postalCode: company.postalCode,
      country: company.country,
      currency: company.currency,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    });
  },
};

export const getRolesTool = {
  name: "get_roles",
  description: "Get available user roles and their permissions.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({}),
  execute: async () => {
    const result = await getGetRolesInteractor().invoke({
      pagination: { page: 1, pageSize: 100 },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      items: result.data.items.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        isSystemRole: role.isSystemRole,
        permissions: role.permissions,
      })),
      total: result.data.pagination?.total ?? result.data.items.length,
    });
  },
};
