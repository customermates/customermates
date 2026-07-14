import { z } from "zod";

import {
  encodeToToon,
  formatDatesInResponse,
  runInteractor,
  validationError,
  mcpPage,
  mcpPageSize,
  filtersDescription,
  sortDescription,
} from "./utils";

import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { filterFieldsHint } from "@/core/types/filter-field-value-kind";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import {
  getGetCompanyDetailsInteractor,
  getGetMyConnectedAccountsInteractor,
  getGetRolesApiInteractor,
  getGetUserDetailsInteractor,
  getGetUsersApiInteractor,
} from "@/core/di";

export const getWorkspaceContextTool = {
  name: "get_workspace_context",
  title: "Get workspace context",
  description:
    "Use this when starting a session: returns the current user, company, role catalog with permissions, and connected messaging accounts in one call. " +
    "Each role carries its full permission list; match roleId values from list_users against it. " +
    "Each connected account includes { id, provider, status, emailAddress, displayName, shared, isOwner, lastSyncedAt, linkedinProducts }; " +
    "use the id as connectedAccountId for send_email and send_chat_message and check status before sending. " +
    "For LinkedIn, linkedinProducts lists which products the account can send from (classic, sales_navigator, recruiter); only pass a linkedinProduct that appears there.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({}),
  execute: async () => {
    const [userResult, companyResult, rolesResult, accountsResult] = await Promise.all([
      getGetUserDetailsInteractor().invoke(),
      getGetCompanyDetailsInteractor().invoke(),
      getGetRolesApiInteractor().invoke({ pagination: { page: 1, pageSize: 100 } }),
      getGetMyConnectedAccountsInteractor().invoke(),
    ]);
    if (!rolesResult.ok) return validationError(rolesResult.error);
    if (!accountsResult.ok) return validationError(accountsResult.error);
    const company = companyResult.data;
    return encodeToToon(
      formatDatesInResponse({
        user: userResult.data,
        company: {
          id: company.id,
          currency: company.currency,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt,
        },
        roles: rolesResult.data.items,
        connectedAccounts: accountsResult.data,
      }),
    );
  },
};

const ListUsersSchema = z.object({
  searchTerm: z.string().optional().describe("Free-text search against firstName and lastName"),
  filters: z
    .array(FilterSchema)
    .optional()
    .describe(
      filtersDescription(filterFieldsHint([FilterFieldKey.status, FilterFieldKey.createdAt, FilterFieldKey.updatedAt])),
    ),
  sortDescriptor: SortDescriptorSchema.optional().describe(sortDescription("name, createdAt, updatedAt")),
  page: mcpPage(),
  pageSize: mcpPageSize(100, "Results per page: 5, 10, 25, or 100 (default 100)"),
});

export const listUsersTool = {
  name: "list_users",
  title: "List users",
  description:
    "Use this when you need the workspace members: returns { id, firstName, lastName, email, roleId, status } per user. " +
    "Optional: searchTerm (matches firstName/lastName), filters, sortDescriptor, page, pageSize. " +
    "Use the id as userId for manage_team update_member and for userIds in record tools; resolve roleId via get_workspace_context.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: ListUsersSchema,
  execute: (params: z.infer<typeof ListUsersSchema>) =>
    runInteractor(
      getGetUsersApiInteractor().invoke({
        searchTerm: params.searchTerm,
        filters: params.filters,
        sortDescriptor: params.sortDescriptor,
        pagination: { page: params.page, pageSize: params.pageSize },
      }),
      (data) =>
        encodeToToon({
          items: data.items.map((item) => ({
            id: item.id,
            firstName: item.firstName,
            lastName: item.lastName,
            email: item.email,
            roleId: item.roleId,
            status: item.status,
          })),
          total: data.pagination?.total ?? data.items.length,
        }),
    ),
};
