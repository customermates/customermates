import { z } from "zod";

export const SalesListSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  type: z.string().nullish(),
  description: z.string().nullish(),
  items_count: z.number().nullish(),
  last_modified_at: z.string().nullish(),
  last_viewed_at: z.string().nullish(),
});
export type SalesList = z.infer<typeof SalesListSchema>;

export const SalesListPageSchema = z.looseObject({
  data: z.array(SalesListSchema),
  total_count: z.number().nullish(),
  next_cursor: z.string().nullish(),
});
export type SalesListPage = z.infer<typeof SalesListPageSchema>;

export const SalesListItemSchema = z.looseObject({
  id: z.string(),
  object: z.string().nullish(),
  member_id: z.string().nullish(),
  display_name: z.string().nullish(),
  name: z.string().nullish(),
  public_identifier: z.string().nullish(),
  profile_url: z.string().nullish(),
  public_picture_url: z.string().nullish(),
  headline: z.string().nullish(),
  summary: z.string().nullish(),
  location: z.string().nullish(),
  industry: z.string().nullish(),
  network_distance: z.string().nullish(),
  can_send_inmail: z.boolean().nullish(),
  relations_count: z.number().nullish(),
  shared_relations_count: z.number().nullish(),
  has_been_saved: z.union([z.boolean(), z.string()]).nullish(),
  current_positions: z.array(z.looseObject({ company: z.string().nullish(), role: z.string().nullish() })).nullish(),
});
export type SalesListItem = z.infer<typeof SalesListItemSchema>;

export const SalesListItemPageSchema = z.looseObject({
  data: z.array(SalesListItemSchema),
  total_count: z.number().nullish(),
  next_cursor: z.string().nullish(),
});
export type SalesListItemPage = z.infer<typeof SalesListItemPageSchema>;

export const SaveToSalesListResultSchema = z.looseObject({
  object: z.string().nullish(),
});
export type SaveToSalesListResult = z.infer<typeof SaveToSalesListResultSchema>;

export const SalesListKindSchema = z.enum(["leads", "accounts"]);
export type SalesListKind = z.infer<typeof SalesListKindSchema>;

export const SalesCompanySchema = z.looseObject({
  id: z.string(),
  object: z.string().nullish(),
  display_name: z.string().nullish(),
  public_identifier: z.string().nullish(),
  profile_url: z.string().nullish(),
  public_picture_url: z.string().nullish(),
  location: z.string().nullish(),
  industry: z.string().nullish(),
  summary: z.string().nullish(),
  headcount: z.number().nullish(),
  specialties: z.array(z.string()).nullish(),
  website: z.string().nullish(),
  founded_on: z.number().nullish(),
  relations_count: z.number().nullish(),
  is_hiring_on_linkedin: z.boolean().nullish(),
  has_been_saved: z.union([z.boolean(), z.string()]).nullish(),
  is_starred: z.boolean().nullish(),
});
export type SalesCompany = z.infer<typeof SalesCompanySchema>;

export const SalesCompanyPageSchema = z.looseObject({
  data: z.array(SalesCompanySchema),
  total_count: z.number().nullish(),
  next_cursor: z.string().nullish(),
});
export type SalesCompanyPage = z.infer<typeof SalesCompanyPageSchema>;

export const SalesSearchParameterTypeSchema = z.enum([
  "COMPANY",
  "ACCOUNT_LIST",
  "LEAD_LIST",
  "LOCATION",
  "POSTAL_CODE",
  "JOB_FUNCTION",
  "JOB_TITLE",
  "INDUSTRY",
  "GROUP",
  "SCHOOL",
  "RELATION",
  "PERSONA",
  "SAVED_PEOPLE_SEARCH",
  "SAVED_COMPANY_SEARCH",
  "RECENT_SEARCH",
  "PROFILE_LANGUAGE",
]);
export type SalesSearchParameterType = z.infer<typeof SalesSearchParameterTypeSchema>;

export const SalesSearchParameterSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
});
export type SalesSearchParameter = z.infer<typeof SalesSearchParameterSchema>;

export const SalesSearchParameterPageSchema = z.looseObject({
  data: z.array(SalesSearchParameterSchema),
  total_count: z.number().nullish(),
  next_cursor: z.string().nullish(),
});
export type SalesSearchParameterPage = z.infer<typeof SalesSearchParameterPageSchema>;

export const SalesParamIdsFilterSchema = z.object({
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});

const SalesYearsRangeSchema = z.object({
  min: z.literal([1, 3, 6, 10]).optional(),
  max: z.literal([1, 2, 5, 10]).optional(),
});

const SalesHeadcountRangeSchema = z.object({
  min: z.literal([1, 51, 201, 501, 1001, 5001, 10001]).optional(),
  max: z.literal([0, 10, 200, 500, 1000, 5000, 10000]).optional(),
});

const SalesLoadSavedSearchSchema = z.object({
  id: z.string().min(1),
  last_viewed_at: z.number().optional(),
});

const SalesLoadRecentSearchSchema = z.object({
  id: z.string().min(1),
});

export const SalesPeopleFiltersSchema = z.object({
  keywords: z.string().optional(),
  load_saved_search: SalesLoadSavedSearchSchema.optional().describe(
    "Runs a saved search (id from parameter type SAVED_PEOPLE_SEARCH). Overrides all other filters",
  ),
  load_recent_search: SalesLoadRecentSearchSchema.optional().describe(
    "Runs a recent search (id from parameter type RECENT_SEARCH). Overrides all other filters",
  ),
  current_company: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type COMPANY or ACCOUNT_LIST"),
  past_company: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type COMPANY or ACCOUNT_LIST"),
  company_headcount: z.array(SalesHeadcountRangeSchema).optional(),
  company_type: z
    .array(
      z.enum([
        "PUBLIC_COMPANY",
        "PRIVATELY_HELD",
        "NON_PROFIT",
        "EDUCATIONAL_INSTITUTION",
        "PARTNERSHIP",
        "SELF_EMPLOYED",
        "SELF_OWNED",
        "GOVERNMENT_AGENCY",
      ]),
    )
    .optional(),
  company_location: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type LOCATION"),
  function: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type JOB_FUNCTION"),
  current_job_title: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type JOB_TITLE"),
  past_job_title: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type JOB_TITLE"),
  seniority: z
    .object({
      include: z
        .array(
          z.enum([
            "OWNER/PARTNER",
            "CXO",
            "VICE_PRESIDENT",
            "DIRECTOR",
            "EXPERIENCED_MANAGER",
            "ENTRY_LEVEL_MANAGER",
            "STRATEGIC",
            "SENIOR",
            "ENTRY_LEVEL",
            "IN_TRAINING",
          ]),
        )
        .optional(),
      exclude: z
        .array(
          z.enum([
            "OWNER/PARTNER",
            "CXO",
            "VICE_PRESIDENT",
            "DIRECTOR",
            "EXPERIENCED_MANAGER",
            "ENTRY_LEVEL_MANAGER",
            "STRATEGIC",
            "SENIOR",
            "ENTRY_LEVEL",
            "IN_TRAINING",
          ]),
        )
        .optional(),
    })
    .optional(),
  years_in_company: z.array(SalesYearsRangeSchema).optional(),
  years_in_position: z.array(SalesYearsRangeSchema).optional(),
  years_of_experience: z.array(SalesYearsRangeSchema).optional(),
  location: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type LOCATION"),
  postal_code: SalesParamIdsFilterSchema.extend({
    radius: z.literal([1, 5, 10, 25, 35, 50, 75, 100]).optional().describe("Distance radius in miles"),
  })
    .optional()
    .describe("Parameter ids of type POSTAL_CODE"),
  industry: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type INDUSTRY"),
  first_name: z.array(z.string()).optional(),
  last_name: z.array(z.string()).optional(),
  profile_language: z.array(z.string()).optional().describe("Parameter ids of type PROFILE_LANGUAGE"),
  group: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type GROUP"),
  school: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type SCHOOL"),
  following_your_company: z.boolean().optional(),
  viewed_your_profile_recently: z.boolean().optional(),
  network_distance: z
    .array(z.literal([1, 2, 3, "GROUP"]))
    .optional()
    .describe("1 first degree, 2 second, 3 third+, GROUP shared group members"),
  connections_of: z.array(z.string()).optional().describe("Parameter ids of type RELATION"),
  past_colleague: z.boolean().optional(),
  shared_experiences: z.boolean().optional(),
  changed_jobs: z.boolean().optional(),
  posted_on_linkedin: z.boolean().optional(),
  persona: z.array(z.string()).optional().describe("Parameter ids of type PERSONA"),
  account_list: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type ACCOUNT_LIST"),
  lead_list: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type LEAD_LIST"),
  recent_interaction: z.object({ viewed_profile: z.boolean().optional(), messaged: z.boolean().optional() }).optional(),
  saved_resources: z.object({ saved_leads: z.boolean().optional(), saved_accounts: z.boolean().optional() }).optional(),
});
export type SalesPeopleFilters = z.infer<typeof SalesPeopleFiltersSchema>;

export const SalesCompanyFiltersSchema = z.object({
  keywords: z.string().optional(),
  load_saved_search: SalesLoadSavedSearchSchema.optional().describe(
    "Runs a saved search (id from parameter type SAVED_COMPANY_SEARCH). Overrides all other filters",
  ),
  load_recent_search: SalesLoadRecentSearchSchema.optional().describe(
    "Runs a recent search (id from parameter type RECENT_SEARCH). Overrides all other filters",
  ),
  annual_revenue: z
    .object({
      min: z.literal([0, 0.5, 1, 2.5, 5, 10, 20, 50, 100, 500, 1000]).optional(),
      max: z.literal([0.5, 1, 2.5, 5, 10, 20, 50, 100, 500, 1000]).optional(),
      currency: z.string(),
    })
    .optional()
    .describe("Revenue range in millions"),
  headcount: z.array(SalesHeadcountRangeSchema).optional(),
  headcount_growth: z.object({ min: z.number(), max: z.number() }).optional().describe("Growth range in percent"),
  location: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type LOCATION"),
  postal_code: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type POSTAL_CODE"),
  industry: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type INDUSTRY"),
  followers: z
    .array(
      z.object({
        min: z.literal([1, 51, 101, 1001, 5001]).optional(),
        max: z.literal([50, 100, 1000, 5000]).optional(),
      }),
    )
    .optional(),
  department_headcount: z
    .object({ min: z.number(), max: z.number(), department: z.string() })
    .optional()
    .describe("department is a parameter id of type JOB_FUNCTION"),
  department_headcount_growth: z
    .object({ min: z.number(), max: z.number(), department: z.string() })
    .optional()
    .describe("department is a parameter id of type JOB_FUNCTION"),
  fortune: z
    .array(
      z.object({
        min: z.literal([51, 101, 251]).optional(),
        max: z.literal([50, 100, 250, 500]).optional(),
      }),
    )
    .optional(),
  spotlights: z
    .array(
      z.enum(["HIRING_ON_LINKEDIN", "RECENT_LEADERSHIP_CHANGE", "RECENT_FUNDING_EVENTS", "FIRST_DEGREE_CONNECTIONS"]),
    )
    .optional(),
  saved_accounts: z.boolean().optional().describe("Include all your saved accounts in the results"),
  account_list: SalesParamIdsFilterSchema.optional().describe("Parameter ids of type ACCOUNT_LIST"),
});
export type SalesCompanyFilters = z.infer<typeof SalesCompanyFiltersSchema>;
