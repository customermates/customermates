import { z } from "zod";

import {
  formatDatesInResponse,
  runInteractor,
  mcpInteractorFailure,
  mcpPage,
  mcpPageSize,
  filtersDescription,
  sortDescription,
  toonResult,
} from "./utils";

import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { filterFieldsHint } from "@/core/types/filter-field-value-kind";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import {
  getGetCompanySettingsInteractor,
  getGetMyConnectedAccountsInteractor,
  getGetRolesApiInteractor,
  getGetUserDetailsInteractor,
  getGetUsersApiInteractor,
} from "@/core/di";

const WorkspaceContextOutputSchema = z.looseObject({
  user: z.looseObject({}),
  company: z.looseObject({ id: z.string(), currency: z.string().nullable().optional() }),
  roles: z.array(z.looseObject({ id: z.string() })),
  connectedAccounts: z.array(z.looseObject({ id: z.string() })),
});

const ListUsersOutputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
      email: z.string(),
      roleId: z.string().nullable(),
      status: z.string(),
    }),
  ),
  total: z.number(),
});

export const getWorkspaceContextTool = {
  name: "get_workspace_context",
  title: "Get workspace context",
  description:
    "Use this when starting a session: returns the current user, company, role catalog with permissions, and connected messaging accounts in one call. " +
    "company.terminology gives the singular and plural label this workspace uses for each record type, keyed by the canonical entity type. " +
    'Always phrase answers with those labels (for example say "People" when contact.plural is People) and map the words the user types back onto the canonical entity type. ' +
    "Tool names, filter fields and ids stay canonical regardless of the labels. " +
    "Each role carries its full permission list; match roleId values from list_users against it. " +
    "Each connected account includes { id, provider, status, emailAddress, displayName, shared, isOwner, lastSyncedAt, linkedinProducts }; " +
    "use the id as connectedAccountId for send_email and send_chat_message and check status before sending. " +
    "For LinkedIn, linkedinProducts lists which products the account can send from (classic, sales_navigator, recruiter); only pass a linkedinProduct that appears there.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({}),
  outputSchema: WorkspaceContextOutputSchema,
  execute: async () => {
    const [userResult, companyResult, rolesResult, accountsResult] = await Promise.all([
      getGetUserDetailsInteractor().invoke(),
      getGetCompanySettingsInteractor().invoke(),
      getGetRolesApiInteractor().invoke({ pagination: { page: 1, pageSize: 100 } }),
      getGetMyConnectedAccountsInteractor().invoke(),
    ]);
    if (!rolesResult.ok) return mcpInteractorFailure(rolesResult.error);
    if (!accountsResult.ok) return mcpInteractorFailure(accountsResult.error);
    const company = companyResult.data;
    return toonResult(
      formatDatesInResponse({
        user: userResult.data,
        company: {
          id: company.id,
          currency: company.currency,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt,
          terminology: company.terminology.labels,
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
    "Use list_users.items[].id as userId for manage_team update_member and for userIds in record tools; match roleId against get_workspace_context.roles[].id for the role name and permissions.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: ListUsersSchema,
  outputSchema: ListUsersOutputSchema,
  execute: (params: z.infer<typeof ListUsersSchema>) =>
    runInteractor(
      getGetUsersApiInteractor().invoke({
        searchTerm: params.searchTerm,
        filters: params.filters,
        sortDescriptor: params.sortDescriptor,
        pagination: { page: params.page, pageSize: params.pageSize },
      }),
      (data) =>
        toonResult({
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
