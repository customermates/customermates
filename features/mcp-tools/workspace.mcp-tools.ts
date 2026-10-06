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
} from "@/core/di";

const WorkspaceContextOutputSchema = z.looseObject({
  user: z.looseObject({}),
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
  "Discover accessible types and their editable labels with discover_record_types; get_record_model returns their current fields and permissions. " +
  "Each role carries its full permission list; match roleId values from list_users against it. " +
  "Each connected account includes { id, provider, status, emailAddress, displayName, shared, isOwner, lastSyncedAt, linkedinProducts }; " +
  "use the id as connectedAccountId for send_email and send_chat_message and check status before sending. " +
  "For LinkedIn, linkedinProducts lists which products the account can send from (classic, sales_navigator, recruiter); only pass a linkedinProduct that appears there.";

async function workspaceContext(wikiPage: number | null) {
  const [userResult, rolesResult, accountsResult, wikiResult] = await Promise.all([
    getGetUserDetailsInteractor().invoke(),
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
    "Use this when starting a session: returns the current user, role catalog with permissions, connected messaging accounts, and the Knowledge Base in one call. " +
    "On the first page wiki.guide is the Operating Guide (follow it; nextOffset marks where the full page continues) and wiki.procedures lists procedures with whenToUse (read the matching one before acting). " +
    "wiki.items are knowledge pages, ten per page in creation order, each with id, title, url, timestamps and a short opening excerpt, never the complete page. " +
    "Pass wiki.nextPage as wikiPage to continue. wiki is omitted without Knowledge Base Read. " +
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
      "Use this when starting a session: returns the current user, role catalog with permissions, and connected messaging accounts in one call. " +
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
    "Use this when you need the workspace members: returns { id, firstName, lastName, email, roleId, status } per user. " +
    "Optional: searchTerm (matches firstName/lastName), filters, sortDescriptor, page, pageSize. " +
    "Use list_users.items[].id as userId for manage_team update_member and for assignedUserIds in record tools; match roleId against get_workspace_context.roles[].id for the role name and permissions.",
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
