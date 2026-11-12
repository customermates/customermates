import { z } from "zod";

import {
  fetchMcpPage,
  formatDatesInResponse,
  runInteractor,
  mcpInteractorFailure,
  mcpPage,
  mcpPageSize,
  McpPageOutputShape,
  filtersDescription,
  sortDescription,
  toonResult,
} from "./utils";

import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { filterFieldsHint } from "@/core/types/filter-field-value-kind";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";
import {
  getGetMyConnectedAccountsContextInteractor,
  getGetRolesApiInteractor,
  getGetUserDetailsInteractor,
  getGetUsersApiInteractor,
  getGetWikiCatalogInteractor,
  getGetCompanyInteractor,
} from "@/core/di";

const WorkspaceContextOutputSchema = z.looseObject({
  user: z.looseObject({}),
  company: z.looseObject({ id: z.string(), name: z.string().nullable() }),
  roles: z.array(z.looseObject({ id: z.string() })),
  connectedAccounts: z.array(z.looseObject({ id: z.string() })),
  wiki: z
    .looseObject({
      total: z.number(),
      page: z.number(),
      nextPage: z.number().nullable(),
      truncated: z.boolean(),
      items: z.array(z.looseObject({ id: z.string(), title: z.string(), url: z.string(), excerpt: z.string() })),
    })
    .optional(),
});

const ListUsersOutputSchema = z.object({
  total: z.number(),
  ...McpPageOutputShape,
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
});

const WORKSPACE_CONTEXT_FIELDS_DESCRIPTION =
  "Each role carries its full permission list; without role management only the user's own role is listed, and a user's roleId matches a role id. " +
  "Each connected account includes { id, provider, status, emailAddress, displayName, shared, isOwner, lastSyncedAt, linkedinProducts }; " +
  "the id is the connectedAccountId of that account and status is its connection status. " +
  "For LinkedIn, linkedinProducts lists which products the account can send from (classic, sales_navigator, recruiter).";

async function workspaceContext(wikiPage: number | null) {
  const [userResult, companyResult, rolesResult, accountsResult, wikiResult] = await Promise.all([
    getGetUserDetailsInteractor().invoke(),
    getGetCompanyInteractor().invoke(),
    getGetRolesApiInteractor().invoke({ pagination: { page: 1, pageSize: 100 } }),
    getGetMyConnectedAccountsContextInteractor().invoke(),
    wikiPage === null
      ? null
      : getGetWikiCatalogInteractor()
          .invoke({ page: wikiPage })
          .catch((error: unknown) => {
            if (error instanceof ForbiddenError && error.code === AppErrorCode.permissionDenied) return null;
            throw error;
          }),
  ]);
  if (!rolesResult.ok) return mcpInteractorFailure(rolesResult.error);
  if (!accountsResult.ok) return mcpInteractorFailure(accountsResult.error);
  if (wikiResult && !wikiResult.ok) return mcpInteractorFailure(wikiResult.error);
  const wiki = wikiResult?.data;
  return toonResult(
    formatDatesInResponse({
      user: userResult.data,
      company: companyResult.data,
      ...(wiki
        ? {
            wiki: {
              ...(wiki.guide ? { guide: wiki.guide } : {}),
              ...(wiki.procedures?.total ? { procedures: wiki.procedures } : {}),
              total: wiki.total,
              page: wiki.page,
              nextPage: wiki.nextPage,
              truncated: wiki.truncated,
              items: wiki.items,
            },
          }
        : {}),
      roles: rolesResult.data.items,
      connectedAccounts: accountsResult.data,
    }),
  );
}

export const getWorkspaceContextTool = {
  name: "get_workspace_context",
  title: "Get workspace context",
  description:
    "Returns the current user, company (the workspace, with its name; null for an unnamed workspace), role catalog with permissions, connected messaging accounts, and the Knowledge Base in one response. " +
    "This connection is bound to exactly one workspace: every tool reads and writes only that workspace, and another workspace of the same login needs its own connection. " +
    "On the first page wiki.guide is the Operating Guide (nextOffset marks where the full page continues) and wiki.procedures lists procedures with whenToUse. " +
    "wiki.items are knowledge pages, ten per page in creation order, each with id, title, url, timestamps and a short opening excerpt, not the complete page. " +
    "wiki.nextPage is the wikiPage value of the following catalog page. wiki is omitted without Knowledge Base Read. " +
    WORKSPACE_CONTEXT_FIELDS_DESCRIPTION,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({
    wikiPage: mcpPage().describe("Knowledge Base catalog page, ten entries per page (default 1)"),
  }),
  outputSchema: WorkspaceContextOutputSchema,
  execute: ({ wikiPage = 1 }: { wikiPage?: number } = {}) => workspaceContext(wikiPage),
};

export function hostedWorkspaceContextTool() {
  return {
    ...getWorkspaceContextTool,
    description:
      "Returns the current user, company (the workspace, with its name; null for an unnamed workspace), role catalog with permissions, and connected messaging accounts in one response. " +
      WORKSPACE_CONTEXT_FIELDS_DESCRIPTION,
    inputSchema: z.object({}),
    execute: () => workspaceContext(null),
  };
}

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
  pageSize: mcpPageSize(25),
});

export const listUsersTool = {
  name: "list_users",
  title: "List users",
  description:
    "Returns the workspace members as { id, firstName, lastName, email, roleId, status } per user. " +
    "Optional: searchTerm (matches firstName/lastName), filters, sortDescriptor, page, pageSize. " +
    "Each id is the user id of that member (the userId of a team member update and an assignedUserIds value on records); roleId is the id of a role in the workspace role catalog.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: ListUsersSchema,
  outputSchema: ListUsersOutputSchema,
  execute: (params: z.infer<typeof ListUsersSchema>) =>
    runInteractor(
      fetchMcpPage({ page: params.page, pageSize: params.pageSize }, (pagination) =>
        getGetUsersApiInteractor().invoke({
          searchTerm: params.searchTerm,
          filters: params.filters,
          sortDescriptor: params.sortDescriptor,
          pagination,
        }),
      ),
      (data) =>
        toonResult({
          total: data.pagination?.total ?? data.items.length,
          page: params.page,
          pageSize: params.pageSize,
          items: data.items.map((item) => ({
            id: item.id,
            firstName: item.firstName,
            lastName: item.lastName,
            email: item.email,
            roleId: item.roleId,
            status: item.status,
          })),
        }),
    ),
};
