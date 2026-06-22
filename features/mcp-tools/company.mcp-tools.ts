import { z } from "zod";
import { CountryCode, Currency } from "@/generated/prisma";

import { encodeToToon, enumHint, formatDatesInResponse, runInteractor } from "./utils";

import { getGetCompanyDetailsInteractor, getGetRolesInteractor, getUpdateCompanyDetailsInteractor } from "@/core/di";
import { UpdateCompanyDetailsSchema } from "@/features/company/update-company-details.interactor";

const countryValues = Object.values(CountryCode);
const currencyValues = Object.values(Currency);

export const getCompanyTool = {
  name: "get_company",
  description: "Return the current company's profile (name, address, currency, timestamps). No arguments.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({}),
  execute: async () => {
    const result = await getGetCompanyDetailsInteractor().invoke();
    const company = result.data;
    return encodeToToon(
      formatDatesInResponse({
        id: company.id,
        name: company.name,
        street: company.street,
        city: company.city,
        postalCode: company.postalCode,
        country: company.country,
        currency: company.currency,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      }),
    );
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
  inputSchema: UpdateCompanyDetailsSchema,
  execute: (params: z.infer<typeof UpdateCompanyDetailsSchema>) =>
    runInteractor(getUpdateCompanyDetailsInteractor().invoke(params), (data) =>
      encodeToToon({ name: data.name, message: "Company profile updated" }),
    ),
};

export const listRolesTool = {
  name: "list_roles",
  description:
    "List every role defined in the company along with its permissions. " +
    "Returns { id, name, description, isSystemRole, permissions } per role.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({}),
  execute: () =>
    runInteractor(getGetRolesInteractor().invoke({ pagination: { page: 1, pageSize: 100 } }), (data) =>
      encodeToToon({
        items: data.items.map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description,
          isSystemRole: role.isSystemRole,
          permissions: role.permissions,
        })),
        total: data.pagination?.total ?? data.items.length,
      }),
    ),
};
