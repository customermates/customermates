import type { SalesCompany, SalesList, SalesListItem } from "@/ee/messaging/sales-navigator/sales-navigator.schema";

import { z } from "zod";

import { encodeToToon, formatDatesInResponse, runInteractor, validationError } from "./utils";

import { SalesCompanySchema } from "@/ee/messaging/sales-navigator/sales-navigator.schema";
import { LinkedinListSalesListsSchema } from "@/ee/messaging/sales-navigator/linkedin-list-sales-lists.interactor";
import { LinkedinBrowseSalesListSchema } from "@/ee/messaging/sales-navigator/linkedin-browse-sales-list.interactor";
import { LinkedinSaveToSalesListSchema } from "@/ee/messaging/sales-navigator/linkedin-save-to-sales-list.interactor";
import { LinkedinSearchSalesNavigatorSchema } from "@/ee/messaging/sales-navigator/linkedin-search-sales-navigator.interactor";
import { LinkedinSearchSalesPeopleSchema } from "@/ee/messaging/sales-navigator/linkedin-search-sales-people.interactor";
import { LinkedinSearchSalesCompaniesSchema } from "@/ee/messaging/sales-navigator/linkedin-search-sales-companies.interactor";
import { LinkedinListSalesSearchParametersSchema } from "@/ee/messaging/sales-navigator/linkedin-list-sales-search-parameters.interactor";
import {
  getLinkedinBrowseSalesListInteractor,
  getLinkedinListSalesListsInteractor,
  getLinkedinListSalesSearchParametersInteractor,
  getLinkedinSaveToSalesListInteractor,
  getLinkedinSearchSalesCompaniesInteractor,
  getLinkedinSearchSalesNavigatorInteractor,
  getLinkedinSearchSalesPeopleInteractor,
} from "@/core/di";

const SearchSalesLeadsToolSchema = z.object({
  connectedAccountId: LinkedinSearchSalesNavigatorSchema.shape.connectedAccountId.describe(
    "Connected account id of a LinkedIn account with a Sales Navigator subscription (from get_workspace_context)",
  ),
  url: LinkedinSearchSalesNavigatorSchema.shape.url
    .optional()
    .describe(
      "A Sales Navigator search URL copied from the browser (linkedin.com/sales/search/...). When set, filters are ignored",
    ),
  filters: LinkedinSearchSalesPeopleSchema.shape.filters.describe(
    "Structured people search. Fields taking parameter ids resolve them via linkedin_get_sales_search_parameters with the type named in the field description",
  ),
  offset: LinkedinSearchSalesNavigatorSchema.shape.offset.describe("Pagination offset (results come in pages)"),
  limit: LinkedinSearchSalesNavigatorSchema.shape.limit.describe("Results per page (1-100, default 10)"),
});

const SearchSalesCompaniesToolSchema = z.object({
  connectedAccountId: LinkedinSearchSalesCompaniesSchema.shape.connectedAccountId.describe(
    "Connected account id of a LinkedIn account with a Sales Navigator subscription (from get_workspace_context)",
  ),
  url: LinkedinSearchSalesNavigatorSchema.shape.url
    .optional()
    .describe(
      "A Sales Navigator company search URL copied from the browser (linkedin.com/sales/search/company...). When set, filters are ignored",
    ),
  filters: LinkedinSearchSalesCompaniesSchema.shape.filters.describe(
    "Structured company search. Fields taking parameter ids resolve them via linkedin_get_sales_search_parameters with the type named in the field description",
  ),
  offset: LinkedinSearchSalesCompaniesSchema.shape.offset.describe("Pagination offset (results come in pages)"),
  limit: LinkedinSearchSalesCompaniesSchema.shape.limit.describe("Results per page (1-100, default 10)"),
});

const GetSalesSearchParametersToolSchema = z.object({
  connectedAccountId: LinkedinListSalesSearchParametersSchema.shape.connectedAccountId.describe(
    "Connected account id of a LinkedIn account with a Sales Navigator subscription (from get_workspace_context)",
  ),
  type: LinkedinListSalesSearchParametersSchema.shape.type.describe(
    "Which parameter family to look up, matching the filter field you want to fill",
  ),
  keywords: LinkedinListSalesSearchParametersSchema.shape.keywords.describe(
    "Keyword filter, e.g. a city, industry or list name",
  ),
  offset: LinkedinListSalesSearchParametersSchema.shape.offset.describe("Pagination offset"),
  limit: LinkedinListSalesSearchParametersSchema.shape.limit.describe("Results per page (1-100, default 10)"),
});

const ManageSalesListsToolSchema = z.object({
  action: z
    .enum(["list", "browse", "save"])
    .describe(
      "List-list operation: list (enumerate the account's Sales Navigator lists), browse (read the members of one list), or save (add a lead or account to an existing list)",
    ),
  connectedAccountId: LinkedinListSalesListsSchema.shape.connectedAccountId.describe(
    "Connected account id of a LinkedIn account with a Sales Navigator subscription (from get_workspace_context)",
  ),
  kind: LinkedinListSalesListsSchema.shape.kind.describe(
    "Which list family: leads (people, default) or accounts (companies)",
  ),
  listId: LinkedinBrowseSalesListSchema.shape.listId
    .optional()
    .describe("Required for browse and save: the list id from action list"),
  providerId: LinkedinSaveToSalesListSchema.shape.providerId
    .optional()
    .describe(
      "Required for save: the LinkedIn user id (kind leads, e.g. from linkedin_search_sales_leads or get_social_profile) or company id (kind accounts) to save",
    ),
  offset: LinkedinListSalesListsSchema.shape.offset.describe("list and browse: pagination offset"),
  limit: LinkedinListSalesListsSchema.shape.limit.describe("list and browse: items per page (1-100, default 10)"),
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
  const positionEntries =
    item.current_positions ??
    (item.work_experience ?? [])
      .filter((entry) => entry.ended_on == null)
      .map((entry) => ({
        company: entry.company?.name,
        role: entry.job_title,
        company_id: entry.company?.id,
        company_url: entry.company?.profile_url,
      }));
  const currentPositions = positionEntries
    .map((position) => ({
      company: position.company ?? null,
      role: position.role ?? null,
      company_id: position.company_id ?? null,
      company_url: position.company_url ?? null,
    }))
    .filter((position) => Object.values(position).some((value) => value != null));
  const fields = {
    id: item.id,
    display_name: item.display_name ?? item.name,
    public_identifier: item.public_identifier,
    profile_url: item.profile_url,
    headline: item.headline,
    location: item.location,
    industry: item.industry,
    network_distance: item.network_distance,
    can_send_inmail: item.can_send_inmail,
    shared_relations_count: item.shared_relations_count,
    has_been_saved: item.has_been_saved,
    current_positions: currentPositions.length > 0 ? currentPositions : null,
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
    specialties: company.specialties?.length ? company.specialties : null,
    founded_on: company.founded_on,
    is_hiring_on_linkedin: company.is_hiring_on_linkedin,
    has_been_saved: company.has_been_saved,
  };

  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value != null));
}

export const searchSalesLeadsTool = {
  name: "linkedin_search_sales_leads",
  title: "Search Sales Navigator leads",
  description:
    "Use this when the user wants to find people via LinkedIn Sales Navigator, for example to import them as contacts. " +
    "Two modes: pass a Sales Navigator search URL the user copied from their browser, or build a structured search with filters " +
    "(keywords plus location, industry, company, job title, seniority, headcount and more; resolve parameter ids via linkedin_get_sales_search_parameters first). " +
    "Runs through the connected LinkedIn account with the account owner's license. " +
    "Returns lead rows with id (use as providerId for linkedin_manage_sales_lists save), name, headline, location, profile url and current_positions (company, role, company_id, company_url); use a position's company_id with get_social_profile and profileType=company, or as providerId for linkedin_manage_sales_lists kind accounts; has_been_saved marks leads already on one of your lists. " +
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
        getLinkedinSearchSalesNavigatorInteractor().invoke({
          connectedAccountId: params.connectedAccountId,
          url: params.url,
          offset: params.offset,
          limit: params.limit,
        }),
        format,
      );
    }
    return runInteractor(
      getLinkedinSearchSalesPeopleInteractor().invoke({
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
  name: "linkedin_search_sales_companies",
  title: "Search Sales Navigator companies",
  description:
    "Use this when the user wants to find companies (accounts) via LinkedIn Sales Navigator, for example to import them as organizations. " +
    "Two modes: pass a Sales Navigator company search URL the user copied from their browser, or build a structured search with filters " +
    "(keywords plus location, industry, headcount, annual revenue, spotlights and more; resolve parameter ids via linkedin_get_sales_search_parameters first). " +
    "Returns company rows with id (use as providerId for linkedin_manage_sales_lists save with kind accounts), name, industry, location, headcount, website, specialties, founded year plus hiring and saved flags. " +
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
        getLinkedinSearchSalesNavigatorInteractor().invoke({
          connectedAccountId: params.connectedAccountId,
          url: params.url,
          offset: params.offset,
          limit: params.limit,
        }),
        format,
      );
    }
    return runInteractor(
      getLinkedinSearchSalesCompaniesInteractor().invoke({
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
  name: "linkedin_get_sales_search_parameters",
  title: "Get Sales Navigator search parameters",
  description:
    "Use this to resolve the parameter ids that fill the filter fields of linkedin_search_sales_leads and linkedin_search_sales_companies. " +
    "Pass a type (LOCATION, INDUSTRY, JOB_TITLE, JOB_FUNCTION, COMPANY, SCHOOL, GROUP, RELATION, PERSONA, PROFILE_LANGUAGE, POSTAL_CODE, " +
    "LEAD_LIST, ACCOUNT_LIST, SAVED_PEOPLE_SEARCH, SAVED_COMPANY_SEARCH, RECENT_SEARCH) plus keywords and get back matching ids with display names. " +
    "LEAD_LIST and ACCOUNT_LIST also find existing Sales Navigator lists by name (their id is the listId for linkedin_manage_sales_lists). " +
    "Requires a connected LinkedIn account with an active Sales Navigator subscription.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true },
  inputSchema: GetSalesSearchParametersToolSchema,
  execute: (params: z.infer<typeof GetSalesSearchParametersToolSchema>) =>
    runInteractor(
      getLinkedinListSalesSearchParametersInteractor().invoke({
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
  name: "linkedin_manage_sales_lists",
  title: "Manage Sales Navigator lists",
  description:
    "Use this to work with the Sales Navigator lead and account lists of a connected LinkedIn account. " +
    "action list enumerates the existing lists (kind leads for people, accounts for companies) with id, name and item count. " +
    "action browse returns the members of one list by listId; lead rows include current_positions (company, role, company_id, company_url), and a company_id resolves via get_social_profile with profileType=company. " +
    "action save ADDS a person or company to an existing list: pass listId plus providerId (a LinkedIn user id from linkedin_search_sales_leads, get_social_profile or a thread participant; a company id for kind accounts). " +
    "New lists cannot be created via the API; the user creates them in Sales Navigator first. " +
    "Requires a connected LinkedIn account with an active Sales Navigator subscription.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  inputSchema: ManageSalesListsToolSchema,
  execute: (params: z.infer<typeof ManageSalesListsToolSchema>) => {
    if (params.action === "list") {
      return runInteractor(
        getLinkedinListSalesListsInteractor().invoke({
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
      const parsed = LinkedinBrowseSalesListSchema.safeParse(params);
      if (!parsed.success) return validationError(parsed.error);
      return runInteractor(getLinkedinBrowseSalesListInteractor().invoke(parsed.data), (data) =>
        encodeToToon(
          formatDatesInResponse({
            items: data.data.map(formatSalesListItem),
            total: data.total_count ?? data.data.length,
            next_offset: data.data.length ? (parsed.data.offset ?? 0) + data.data.length : null,
          }),
        ),
      );
    }
    const parsed = LinkedinSaveToSalesListSchema.safeParse(params);
    if (!parsed.success) return validationError(parsed.error);
    return runInteractor(getLinkedinSaveToSalesListInteractor().invoke(parsed.data), (data) =>
      encodeToToon({ listId: parsed.data.listId, providerId: parsed.data.providerId, status: data.object ?? "saved" }),
    );
  },
};
