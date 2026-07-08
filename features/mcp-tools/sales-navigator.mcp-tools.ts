import type { SalesCompany, SalesList, SalesListItem } from "@/ee/messaging/sales-navigator/sales-navigator.schema";

import { z } from "zod";

import { encodeToToon, formatDatesInResponse, runInteractor, validationError } from "./utils";

import { SalesCompanySchema } from "@/ee/messaging/sales-navigator/sales-navigator.schema";
import { ListSalesListsSchema } from "@/ee/messaging/sales-navigator/list-sales-lists.interactor";
import { BrowseSalesListSchema } from "@/ee/messaging/sales-navigator/browse-sales-list.interactor";
import { SaveToSalesListSchema } from "@/ee/messaging/sales-navigator/save-to-sales-list.interactor";
import { SearchSalesNavigatorSchema } from "@/ee/messaging/sales-navigator/search-sales-navigator.interactor";
import { SearchSalesPeopleSchema } from "@/ee/messaging/sales-navigator/search-sales-people.interactor";
import { SearchSalesCompaniesSchema } from "@/ee/messaging/sales-navigator/search-sales-companies.interactor";
import { ListSalesSearchParametersSchema } from "@/ee/messaging/sales-navigator/list-sales-search-parameters.interactor";
import {
  getBrowseSalesListInteractor,
  getListSalesListsInteractor,
  getListSalesSearchParametersInteractor,
  getSaveToSalesListInteractor,
  getSearchSalesCompaniesInteractor,
  getSearchSalesNavigatorInteractor,
  getSearchSalesPeopleInteractor,
} from "@/core/di";

const SearchSalesLeadsToolSchema = z.object({
  connectedAccountId: SearchSalesNavigatorSchema.shape.connectedAccountId.describe(
    "Connected account id of a LinkedIn account with a Sales Navigator subscription (from get_workspace_context)",
  ),
  url: SearchSalesNavigatorSchema.shape.url
    .optional()
    .describe(
      "A Sales Navigator search URL copied from the browser (linkedin.com/sales/search/...). When set, filters are ignored",
    ),
  filters: SearchSalesPeopleSchema.shape.filters.describe(
    "Structured people search. Fields taking parameter ids resolve them via get_sales_search_parameters with the type named in the field description",
  ),
  offset: SearchSalesNavigatorSchema.shape.offset.describe("Pagination offset (results come in pages)"),
  limit: SearchSalesNavigatorSchema.shape.limit.describe("Results per page (1-100, default 10)"),
});

const SearchSalesCompaniesToolSchema = z.object({
  connectedAccountId: SearchSalesCompaniesSchema.shape.connectedAccountId.describe(
    "Connected account id of a LinkedIn account with a Sales Navigator subscription (from get_workspace_context)",
  ),
  url: SearchSalesNavigatorSchema.shape.url
    .optional()
    .describe(
      "A Sales Navigator company search URL copied from the browser (linkedin.com/sales/search/company...). When set, filters are ignored",
    ),
  filters: SearchSalesCompaniesSchema.shape.filters.describe(
    "Structured company search. Fields taking parameter ids resolve them via get_sales_search_parameters with the type named in the field description",
  ),
  offset: SearchSalesCompaniesSchema.shape.offset.describe("Pagination offset (results come in pages)"),
  limit: SearchSalesCompaniesSchema.shape.limit.describe("Results per page (1-100, default 10)"),
});

const GetSalesSearchParametersToolSchema = z.object({
  connectedAccountId: ListSalesSearchParametersSchema.shape.connectedAccountId.describe(
    "Connected account id of a LinkedIn account with a Sales Navigator subscription (from get_workspace_context)",
  ),
  type: ListSalesSearchParametersSchema.shape.type.describe(
    "Which parameter family to look up, matching the filter field you want to fill",
  ),
  keywords: ListSalesSearchParametersSchema.shape.keywords.describe(
    "Keyword filter, e.g. a city, industry or list name",
  ),
  offset: ListSalesSearchParametersSchema.shape.offset.describe("Pagination offset"),
  limit: ListSalesSearchParametersSchema.shape.limit.describe("Results per page (1-100, default 10)"),
});

const ManageSalesListsToolSchema = z.object({
  action: z
    .enum(["list", "browse", "save"])
    .describe(
      "List-list operation: list (enumerate the account's Sales Navigator lists), browse (read the members of one list), or save (add a lead or account to an existing list)",
    ),
  connectedAccountId: ListSalesListsSchema.shape.connectedAccountId.describe(
    "Connected account id of a LinkedIn account with a Sales Navigator subscription (from get_workspace_context)",
  ),
  kind: ListSalesListsSchema.shape.kind.describe("Which list family: leads (people, default) or accounts (companies)"),
  listId: BrowseSalesListSchema.shape.listId
    .optional()
    .describe("Required for browse and save: the list id from action list"),
  providerId: SaveToSalesListSchema.shape.providerId
    .optional()
    .describe(
      "Required for save: the LinkedIn user id (kind leads, e.g. from search_sales_leads or get_social_profile) or company id (kind accounts) to save",
    ),
  offset: ListSalesListsSchema.shape.offset.describe("list and browse: pagination offset"),
  limit: ListSalesListsSchema.shape.limit.describe("list and browse: items per page (1-100, default 10)"),
});

function formatSalesList(list: SalesList) {
  return {
    id: list.id,
    name: list.name,
    description: list.description ?? null,
    items_count: list.items_count ?? null,
    last_modified_at: list.last_modified_at ?? null,
  };
}

function formatSalesListItem(item: SalesListItem) {
  const fields = {
    id: item.id,
    member_id: item.member_id,
    display_name: item.display_name ?? item.name,
    public_identifier: item.public_identifier,
    profile_url: item.profile_url,
    headline: item.headline,
    location: item.location,
    industry: item.industry,
    network_distance: item.network_distance,
    can_send_inmail: item.can_send_inmail,
    shared_relations_count: item.shared_relations_count,
  };

  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value != null));
}

function formatSalesCompany(company: SalesCompany) {
  const fields = {
    id: company.id,
    display_name: company.display_name,
    public_identifier: company.public_identifier,
    profile_url: company.profile_url,
    location: company.location,
    industry: company.industry,
    headcount: company.headcount,
    website: company.website,
    summary: company.summary,
  };

  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value != null));
}

export const searchSalesLeadsTool = {
  name: "search_sales_leads",
  title: "Search Sales Navigator leads",
  description:
    "Use this when the user wants to find people via LinkedIn Sales Navigator, for example to import them as contacts. " +
    "Two modes: pass a Sales Navigator search URL the user copied from their browser, or build a structured search with filters " +
    "(keywords plus location, industry, company, job title, seniority, headcount and more; resolve parameter ids via get_sales_search_parameters first). " +
    "Runs through the connected LinkedIn account with the account owner's license. " +
    "Returns lead rows with id (use as providerId for manage_sales_lists save), name, headline, location and profile url. " +
    "Paginate with offset plus limit; LinkedIn caps a single search at 2500 results, so narrow filters beat deep paging. " +
    "Requires a connected LinkedIn account with an active Sales Navigator subscription; without one the provider rejects the call.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: SearchSalesLeadsToolSchema,
  execute: (params: z.infer<typeof SearchSalesLeadsToolSchema>) => {
    const format = (data: { data: SalesListItem[]; total_count?: number | null }) =>
      encodeToToon(
        formatDatesInResponse({
          items: data.data.map(formatSalesListItem),
          total: data.total_count ?? data.data.length,
          next_offset: data.data.length ? (params.offset ?? 0) + data.data.length : null,
        }),
      );

    if (params.url) {
      return runInteractor(
        getSearchSalesNavigatorInteractor().invoke({
          connectedAccountId: params.connectedAccountId,
          url: params.url,
          offset: params.offset,
          limit: params.limit,
        }),
        format,
      );
    }
    return runInteractor(
      getSearchSalesPeopleInteractor().invoke({
        connectedAccountId: params.connectedAccountId,
        filters: params.filters,
        offset: params.offset,
        limit: params.limit,
      }),
      format,
    );
  },
};

export const searchSalesCompaniesTool = {
  name: "search_sales_companies",
  title: "Search Sales Navigator companies",
  description:
    "Use this when the user wants to find companies (accounts) via LinkedIn Sales Navigator, for example to import them as organizations. " +
    "Two modes: pass a Sales Navigator company search URL the user copied from their browser, or build a structured search with filters " +
    "(keywords plus location, industry, headcount, annual revenue, spotlights and more; resolve parameter ids via get_sales_search_parameters first). " +
    "Returns company rows with id (use as providerId for manage_sales_lists save with kind accounts), name, industry, location, headcount and website. " +
    "Paginate with offset plus limit; LinkedIn caps a single company search at 1000 results. " +
    "Requires a connected LinkedIn account with an active Sales Navigator subscription; without one the provider rejects the call.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: SearchSalesCompaniesToolSchema,
  execute: (params: z.infer<typeof SearchSalesCompaniesToolSchema>) => {
    const format = (data: { data: unknown[]; total_count?: number | null }) =>
      encodeToToon(
        formatDatesInResponse({
          items: data.data.map((item) => formatSalesCompany(SalesCompanySchema.parse(item))),
          total: data.total_count ?? data.data.length,
          next_offset: data.data.length ? (params.offset ?? 0) + data.data.length : null,
        }),
      );

    if (params.url) {
      return runInteractor(
        getSearchSalesNavigatorInteractor().invoke({
          connectedAccountId: params.connectedAccountId,
          url: params.url,
          offset: params.offset,
          limit: params.limit,
        }),
        format,
      );
    }
    return runInteractor(
      getSearchSalesCompaniesInteractor().invoke({
        connectedAccountId: params.connectedAccountId,
        filters: params.filters,
        offset: params.offset,
        limit: params.limit,
      }),
      format,
    );
  },
};

export const getSalesSearchParametersTool = {
  name: "get_sales_search_parameters",
  title: "Get Sales Navigator search parameters",
  description:
    "Use this to resolve the parameter ids that fill the filter fields of search_sales_leads and search_sales_companies. " +
    "Pass a type (LOCATION, INDUSTRY, JOB_TITLE, JOB_FUNCTION, COMPANY, SCHOOL, GROUP, RELATION, PERSONA, PROFILE_LANGUAGE, POSTAL_CODE, " +
    "LEAD_LIST, ACCOUNT_LIST, SAVED_PEOPLE_SEARCH, SAVED_COMPANY_SEARCH, RECENT_SEARCH) plus keywords and get back matching ids with display names. " +
    "LEAD_LIST and ACCOUNT_LIST also find existing Sales Navigator lists by name (their id is the listId for manage_sales_lists). " +
    "Requires a connected LinkedIn account with an active Sales Navigator subscription.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: GetSalesSearchParametersToolSchema,
  execute: (params: z.infer<typeof GetSalesSearchParametersToolSchema>) =>
    runInteractor(
      getListSalesSearchParametersInteractor().invoke({
        connectedAccountId: params.connectedAccountId,
        type: params.type,
        keywords: params.keywords,
        offset: params.offset,
        limit: params.limit,
      }),
      (data) =>
        encodeToToon(
          formatDatesInResponse({
            items: data.data.map((parameter) => ({ id: parameter.id, name: parameter.name })),
            total: data.total_count ?? data.data.length,
            next_offset: data.data.length ? (params.offset ?? 0) + data.data.length : null,
          }),
        ),
    ),
};

export const manageSalesListsTool = {
  name: "manage_sales_lists",
  title: "Manage Sales Navigator lists",
  description:
    "Use this to work with the Sales Navigator lead and account lists of a connected LinkedIn account. " +
    "action list enumerates the existing lists (kind leads for people, accounts for companies) with id, name and item count. " +
    "action browse returns the members of one list by listId. " +
    "action save ADDS a person or company to an existing list: pass listId plus providerId (a LinkedIn user id from search_sales_leads, get_social_profile or a thread participant; a company id for kind accounts). " +
    "New lists cannot be created via the API; the user creates them in Sales Navigator first. " +
    "Requires a connected LinkedIn account with an active Sales Navigator subscription.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  inputSchema: ManageSalesListsToolSchema,
  execute: (params: z.infer<typeof ManageSalesListsToolSchema>) => {
    if (params.action === "list") {
      return runInteractor(
        getListSalesListsInteractor().invoke({
          connectedAccountId: params.connectedAccountId,
          kind: params.kind,
          offset: params.offset,
          limit: params.limit,
        }),
        (data) =>
          encodeToToon(
            formatDatesInResponse({
              items: data.data.map(formatSalesList),
              total: data.total_count ?? data.data.length,
              next_offset: data.data.length ? (params.offset ?? 0) + data.data.length : null,
            }),
          ),
      );
    }
    if (params.action === "browse") {
      const parsed = BrowseSalesListSchema.safeParse(params);
      if (!parsed.success) return validationError(parsed.error);
      return runInteractor(getBrowseSalesListInteractor().invoke(parsed.data), (data) =>
        encodeToToon(
          formatDatesInResponse({
            items: data.data.map(formatSalesListItem),
            total: data.total_count ?? data.data.length,
            next_offset: data.data.length ? (parsed.data.offset ?? 0) + data.data.length : null,
          }),
        ),
      );
    }
    const parsed = SaveToSalesListSchema.safeParse(params);
    if (!parsed.success) return validationError(parsed.error);
    return runInteractor(getSaveToSalesListInteractor().invoke(parsed.data), (data) =>
      encodeToToon({ listId: parsed.data.listId, providerId: parsed.data.providerId, status: data.object ?? "saved" }),
    );
  },
};
