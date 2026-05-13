import { z } from "zod";
import { CountryCode, Currency } from "@/generated/prisma";

import { encodeToToon, enumHint } from "./utils";

import {
  getGetCompanyDetailsInteractor,
  getGetRolesInteractor,
  getUpdateCompanyDetailsInteractor,
} from "@/core/app-di";

const countryValues = Object.values(CountryCode);
const currencyValues = Object.values(Currency);

const UpdateCompanySchema = z.object({
  name: z.string().min(1).describe("Company display name"),
  street: z.string().min(1),
  city: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.enum(CountryCode).describe(`ISO country code ${enumHint(countryValues)}`),
  currency: z
    .enum(Currency)
    .optional()
    .describe(`Default currency ${enumHint(currencyValues)}. Omit to keep existing.`),
});

export const getCompanyTool = {
  name: "get_company",
  description: "Return the current company's profile (name, address, currency, timestamps). No arguments.",
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

export const updateCompanyTool = {
  name: "update_company",
  description:
    "Update the current company's profile. " +
    "Required: name, street, city, postalCode, country. Optional: currency. " +
    `country ${enumHint(countryValues)}. currency ${enumHint(currencyValues)}. ` +
    "Full overwrite — send all required fields each time.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateCompanySchema,
  execute: async (params: z.infer<typeof UpdateCompanySchema>) => {
    const current = await getGetCompanyDetailsInteractor().invoke();
    const result = await getUpdateCompanyDetailsInteractor().invoke({
      name: params.name,
      street: params.street,
      city: params.city,
      postalCode: params.postalCode,
      country: params.country,
      currency: params.currency ?? current.data.currency,
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      name: result.data.name,
      message: "Company profile updated",
    });
  },
};

export const listRolesTool = {
  name: "list_roles",
  description:
    "List every role defined in the company along with its permissions. " +
    "Returns { id, name, description, isSystemRole, permissions } per role.",
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
