import { z } from "zod";
import { CountryCode, Currency } from "@/generated/prisma";

import {
  encodeToToon,
  enumHint,
  formatDatesInResponse,
  runInteractor,
  mcpPage,
  mcpPageSize,
  sortDescription,
} from "./utils";

import { SortDescriptorSchema } from "@/core/base/base-get.schema";
import { getGetCompanyDetailsInteractor, getGetRolesApiInteractor, getUpdateCompanyDetailsInteractor } from "@/core/di";
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

const ListRolesSchema = z.object({
  sortDescriptor: SortDescriptorSchema.optional().describe(sortDescription("type")),
  page: mcpPage(),
  pageSize: mcpPageSize(100, "Results per page: 5, 10, 25, or 100 (default 100)"),
});

export const listRolesTool = {
  name: "list_roles",
  description:
    "List every role defined in the company along with its permissions. " +
    "Optional: sortDescriptor (sortable field: type), page, pageSize. " +
    "Returns { id, name, description, isSystemRole, permissions } per role.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: ListRolesSchema,
  execute: (params: z.infer<typeof ListRolesSchema>) =>
    runInteractor(
      getGetRolesApiInteractor().invoke({
        sortDescriptor: params.sortDescriptor,
        pagination: { page: params.page, pageSize: params.pageSize },
      }),
      (data) =>
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
