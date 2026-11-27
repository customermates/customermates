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
  getGetWikiKnowledgeGapsInteractor,
  getGetWikiLinkReportInteractor,
  getGetCompanyInteractor,
  getUserService,
  getWorkspacePlanFactsService,
  getWorkspaceSlugResolver,
} from "@/core/di";
import * as ErrorReporter from "@/core/observability/server";
import { resolveActiveTenantUser } from "@/core/decorators/resolve-tenant-user";
import { WorkspacePlanFactsSchema } from "@/features/workspace/workspace-plan-facts.schema";

import { PLAN_FACTS_DESCRIPTION } from "./account-workspace.mcp-tools";

const WorkspaceContextOutputSchema = z.looseObject({
  user: z.looseObject({}),
  company: z.looseObject({ id: z.string(), name: z.string().nullable() }),
  plan: WorkspacePlanFactsSchema.nullable(),
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
  "lastSyncedAt is the time the account's last history import finished, not the time of its newest message: a message that arrives later leaves it unchanged. " +
  "For LinkedIn, linkedinProducts lists which products the account can send from (classic, sales_navigator, recruiter).";

async function wikiUpkeep() {
  try {
    const gaps = await getGetWikiKnowledgeGapsInteractor().invoke();
    if (!gaps.ok) return undefined;
    const report = await getGetWikiLinkReportInteractor().invoke({});
    const links = report.ok && !report.data.syncing ? report.data : null;
    const upkeep = {
      ...(gaps.data.items.length > 0 ? { openQuestions: gaps.data.items.length } : {}),
      ...(links && links.orphansTotal > 0 ? { orphanPages: links.orphansTotal } : {}),
      ...(links && links.brokenTotal > 0 ? { pagesWithDeadLinks: links.brokenTotal } : {}),
    };
    return Object.keys(upkeep).length > 0 ? upkeep : undefined;
  } catch (error) {
    if (!(error instanceof ForbiddenError)) ErrorReporter.captureException(error, { tags: { kind: "wiki-upkeep" } });
    return undefined;
  }
}

async function workspacePlan() {
  try {
    const user = await resolveActiveTenantUser(() => getUserService().getActiveTenantUserOrThrow());
    const slug = await getWorkspaceSlugResolver().requireSlugOf(user);
    return await getWorkspacePlanFactsService().factsFor({ companyId: user.companyId, slug });
  } catch (error) {
    ErrorReporter.captureException(error, { tags: { kind: "workspace-plan-facts" } });
    return null;
  }
}

async function workspaceContext(wikiPage: number | null) {
  const [userResult, companyResult, rolesResult, accountsResult, wikiResult, upkeep, plan] = await Promise.all([
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
    wikiPage === 1 ? wikiUpkeep() : undefined,
    workspacePlan(),
  ]);
  if (!rolesResult.ok) return mcpInteractorFailure(rolesResult.error);
  if (!accountsResult.ok) return mcpInteractorFailure(accountsResult.error);
  if (wikiResult && !wikiResult.ok) return mcpInteractorFailure(wikiResult.error);
  const wiki = wikiResult?.data;
  return toonResult(
    formatDatesInResponse({
      user: userResult.data,
      company: companyResult.data,
      plan,
      ...(wiki
        ? {
            wiki: {
              ...(wiki.guide ? { guide: wiki.guide } : {}),
              ...(wiki.procedures?.total ? { procedures: wiki.procedures } : {}),
              ...(upkeep ? { upkeep } : {}),
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
    "Returns the current user, company (the workspace, with its name; null for an unnamed workspace), plan facts, role catalog with permissions, connected messaging accounts, and the Knowledge Base in one response. " +
    "The workspace is the one named by the workspace argument, or the account's only usable workspace when the argument is left out; one connection reaches every workspace of the account, each named per request. " +
    PLAN_FACTS_DESCRIPTION +
    " " +
    "On the first page wiki.guide is the Operating Guide (nextOffset marks where the full page continues) and wiki.procedures lists procedures with whenToUse. " +
    "wiki.items are knowledge pages, ten per page in creation order, each with id, title, url, timestamps and a short opening excerpt, not the complete page. " +
    "wiki.nextPage is the wikiPage value of the following catalog page. wiki is omitted without Knowledge Base Read. " +
    "A page's owner and verifiedAt (when someone last confirmed it is correct) appear when set. " +
    "For someone who may edit pages, wiki.upkeep on the first page counts what is open, and is omitted when nothing is: openQuestions the Knowledge Base could not answer, orphanPages that no other page links to and pagesWithDeadLinks that link to a page that no longer exists; the two link counts are left out while links of recently changed pages are still being read. " +
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
