export const SETUP_SCREENS = ["company", "winning", "afterSale", "dashboard", "knowledge", "data"] as const;
export type SetupScreen = (typeof SETUP_SCREENS)[number];

export const SETUP_QUESTION_FORMATS = [
  "singleChoice",
  "multipleChoice",
  "orderedList",
  "rankedPick",
  "range",
  "shortText",
] as const;
export type SetupQuestionFormat = (typeof SETUP_QUESTION_FORMATS)[number];

export const SETUP_PREFILL_LEVELS = ["yes", "partly", "suggested", "no"] as const;
export type SetupPrefillLevel = (typeof SETUP_PREFILL_LEVELS)[number];

export const SETUP_OPTION_SOURCES = ["countries", "currencies", "locales"] as const;
export type SetupOptionSource = (typeof SETUP_OPTION_SOURCES)[number];

export const SETUP_MAX_RANKED_PICKS = 3;
export const SETUP_MAX_FOLLOW_UP_QUESTIONS = 3;
export const SETUP_PREFILL_CONFIDENCE = 0.7;

export type SetupOption = { id: string; labelKey: string; preselected?: boolean };

type SetupPartBase = {
  id: string;
  labelKey: string;
  prefill: SetupPrefillLevel;
  optional?: boolean;
  visibleWhen?: { part: string; includes: string };
};

export type SetupQuestionPart = SetupPartBase &
  (
    | { format: "singleChoice"; options: SetupOption[]; optionSource?: undefined; upload?: boolean }
    | { format: "singleChoice"; options: []; optionSource: SetupOptionSource; upload?: undefined }
    | { format: "multipleChoice"; options: SetupOption[]; allowCustom: boolean }
    | { format: "orderedList"; winChance: boolean; maxItems: number }
    | { format: "rankedPick"; options: SetupOption[]; maxPicks: number }
    | { format: "range"; unit: "currency" | "days"; single: boolean; min: number; max: number }
    | { format: "shortText"; maxLength: number }
  );

export type SetupQuestion = {
  id: string;
  number: number;
  screen: SetupScreen;
  confirmationCard?: boolean;
  parts: SetupQuestionPart[];
};

export type SetupScreenDefinition = { id: SetupScreen; titleKey: string };

export const SETUP_SCREEN_DEFINITIONS: SetupScreenDefinition[] = [
  { id: "company", titleKey: "WorkspaceSetup.screens.company" },
  { id: "winning", titleKey: "WorkspaceSetup.screens.winning" },
  { id: "afterSale", titleKey: "WorkspaceSetup.screens.afterSale" },
  { id: "dashboard", titleKey: "WorkspaceSetup.screens.dashboard" },
  { id: "knowledge", titleKey: "WorkspaceSetup.screens.knowledge" },
  { id: "data", titleKey: "WorkspaceSetup.screens.data" },
];

export const SETUP_INTERVIEW_ACTIONS = {
  confirm: { labelKey: "WorkspaceSetup.actions.looksRight" },
  addOwn: { labelKey: "WorkspaceSetup.actions.addOwn" },
  upload: { labelKey: "WorkspaceSetup.actions.upload" },
  fromWebsite: { labelKey: "WorkspaceSetup.actions.fromWebsite" },
  winChance: { labelKey: "WorkspaceSetup.actions.winChance" },
};

export const SETUP_QUESTIONS: SetupQuestion[] = [
  {
    id: "company",
    number: 1,
    screen: "company",
    confirmationCard: true,
    parts: [
      {
        id: "companyName",
        labelKey: "WorkspaceSetup.questions.companyName.label",
        format: "shortText",
        maxLength: 120,
        prefill: "yes",
      },
      {
        id: "country",
        labelKey: "WorkspaceSetup.questions.country.label",
        format: "singleChoice",
        options: [],
        optionSource: "countries",
        prefill: "yes",
      },
      {
        id: "language",
        labelKey: "WorkspaceSetup.questions.language.label",
        format: "singleChoice",
        options: [],
        optionSource: "locales",
        prefill: "yes",
      },
      {
        id: "currency",
        labelKey: "WorkspaceSetup.questions.currency.label",
        format: "singleChoice",
        options: [],
        optionSource: "currencies",
        prefill: "yes",
      },
    ],
  },
  {
    id: "offerings",
    number: 2,
    screen: "company",
    parts: [
      {
        id: "offeringKinds",
        labelKey: "WorkspaceSetup.questions.offeringKinds.label",
        format: "multipleChoice",
        allowCustom: true,
        prefill: "yes",
        options: [
          { id: "products", labelKey: "WorkspaceSetup.options.offeringKinds.products" },
          { id: "services", labelKey: "WorkspaceSetup.options.offeringKinds.services" },
          { id: "subscriptions", labelKey: "WorkspaceSetup.options.offeringKinds.subscriptions" },
          { id: "projects", labelKey: "WorkspaceSetup.options.offeringKinds.projects" },
        ],
      },
      {
        id: "offerings",
        labelKey: "WorkspaceSetup.questions.offerings.label",
        format: "orderedList",
        winChance: false,
        maxItems: 20,
        prefill: "yes",
      },
    ],
  },
  {
    id: "customers",
    number: 3,
    screen: "company",
    parts: [
      {
        id: "customerKind",
        labelKey: "WorkspaceSetup.questions.customerKind.label",
        format: "singleChoice",
        prefill: "yes",
        options: [
          { id: "businesses", labelKey: "WorkspaceSetup.options.customerKind.businesses" },
          { id: "consumers", labelKey: "WorkspaceSetup.options.customerKind.consumers" },
          { id: "both", labelKey: "WorkspaceSetup.options.customerKind.both" },
        ],
      },
      {
        id: "industries",
        labelKey: "WorkspaceSetup.questions.industries.label",
        format: "multipleChoice",
        allowCustom: true,
        prefill: "yes",
        options: [],
      },
      {
        id: "customerSize",
        labelKey: "WorkspaceSetup.questions.customerSize.label",
        format: "singleChoice",
        prefill: "partly",
        visibleWhen: { part: "customerKind", includes: "businesses" },
        options: [
          { id: "small", labelKey: "WorkspaceSetup.options.customerSize.small" },
          { id: "medium", labelKey: "WorkspaceSetup.options.customerSize.medium" },
          { id: "large", labelKey: "WorkspaceSetup.options.customerSize.large" },
          { id: "mixed", labelKey: "WorkspaceSetup.options.customerSize.mixed" },
        ],
      },
    ],
  },
  {
    id: "team",
    number: 4,
    screen: "company",
    parts: [
      {
        id: "teamSize",
        labelKey: "WorkspaceSetup.questions.teamSize.label",
        format: "singleChoice",
        prefill: "partly",
        options: [
          { id: "solo", labelKey: "WorkspaceSetup.options.teamSize.solo" },
          { id: "small", labelKey: "WorkspaceSetup.options.teamSize.small" },
          { id: "medium", labelKey: "WorkspaceSetup.options.teamSize.medium" },
          { id: "large", labelKey: "WorkspaceSetup.options.teamSize.large" },
        ],
      },
      {
        id: "teamRoles",
        labelKey: "WorkspaceSetup.questions.teamRoles.label",
        format: "multipleChoice",
        allowCustom: false,
        prefill: "partly",
        options: [
          { id: "sales", labelKey: "WorkspaceSetup.options.teamRoles.sales" },
          { id: "accountManagement", labelKey: "WorkspaceSetup.options.teamRoles.accountManagement" },
          { id: "delivery", labelKey: "WorkspaceSetup.options.teamRoles.delivery" },
          { id: "support", labelKey: "WorkspaceSetup.options.teamRoles.support" },
          { id: "finance", labelKey: "WorkspaceSetup.options.teamRoles.finance" },
        ],
      },
    ],
  },
  {
    id: "leadSources",
    number: 5,
    screen: "winning",
    parts: [
      {
        id: "leadSources",
        labelKey: "WorkspaceSetup.questions.leadSources.label",
        format: "multipleChoice",
        allowCustom: true,
        prefill: "partly",
        options: [
          { id: "website", labelKey: "WorkspaceSetup.options.leadSources.website" },
          { id: "referrals", labelKey: "WorkspaceSetup.options.leadSources.referrals" },
          { id: "outbound", labelKey: "WorkspaceSetup.options.leadSources.outbound" },
          { id: "events", labelKey: "WorkspaceSetup.options.leadSources.events" },
          { id: "socialMedia", labelKey: "WorkspaceSetup.options.leadSources.socialMedia" },
          { id: "ads", labelKey: "WorkspaceSetup.options.leadSources.ads" },
          { id: "partners", labelKey: "WorkspaceSetup.options.leadSources.partners" },
        ],
      },
    ],
  },
  {
    id: "salesSteps",
    number: 6,
    screen: "winning",
    parts: [
      {
        id: "salesSteps",
        labelKey: "WorkspaceSetup.questions.salesSteps.label",
        format: "orderedList",
        winChance: true,
        maxItems: 12,
        prefill: "suggested",
      },
    ],
  },
  {
    id: "dealShape",
    number: 7,
    screen: "winning",
    parts: [
      {
        id: "dealSize",
        labelKey: "WorkspaceSetup.questions.dealSize.label",
        format: "range",
        unit: "currency",
        single: false,
        min: 0,
        max: 100_000_000,
        prefill: "partly",
      },
      {
        id: "salesCycle",
        labelKey: "WorkspaceSetup.questions.salesCycle.label",
        format: "range",
        unit: "days",
        single: true,
        min: 0,
        max: 1_000,
        prefill: "partly",
      },
      {
        id: "revenueModel",
        labelKey: "WorkspaceSetup.questions.revenueModel.label",
        format: "singleChoice",
        prefill: "partly",
        options: [
          { id: "oneOff", labelKey: "WorkspaceSetup.options.revenueModel.oneOff" },
          { id: "recurring", labelKey: "WorkspaceSetup.options.revenueModel.recurring" },
          { id: "both", labelKey: "WorkspaceSetup.options.revenueModel.both" },
        ],
      },
    ],
  },
  {
    id: "dealDetails",
    number: 8,
    screen: "winning",
    parts: [
      {
        id: "dealDetails",
        labelKey: "WorkspaceSetup.questions.dealDetails.label",
        format: "multipleChoice",
        allowCustom: true,
        prefill: "suggested",
        options: [
          { id: "budget", labelKey: "WorkspaceSetup.options.dealDetails.budget" },
          { id: "decisionMaker", labelKey: "WorkspaceSetup.options.dealDetails.decisionMaker" },
          { id: "closeDate", labelKey: "WorkspaceSetup.options.dealDetails.closeDate" },
          { id: "contractEnd", labelKey: "WorkspaceSetup.options.dealDetails.contractEnd" },
          { id: "vatId", labelKey: "WorkspaceSetup.options.dealDetails.vatId" },
          { id: "nextStep", labelKey: "WorkspaceSetup.options.dealDetails.nextStep" },
          { id: "lostReason", labelKey: "WorkspaceSetup.options.dealDetails.lostReason" },
        ],
      },
    ],
  },
  {
    id: "afterSale",
    number: 9,
    screen: "afterSale",
    parts: [
      {
        id: "afterSale",
        labelKey: "WorkspaceSetup.questions.afterSale.label",
        format: "multipleChoice",
        allowCustom: false,
        prefill: "partly",
        options: [
          { id: "projects", labelKey: "WorkspaceSetup.options.afterSale.projects" },
          { id: "ordersInvoices", labelKey: "WorkspaceSetup.options.afterSale.ordersInvoices" },
          { id: "contractsRenewals", labelKey: "WorkspaceSetup.options.afterSale.contractsRenewals" },
          { id: "supportTickets", labelKey: "WorkspaceSetup.options.afterSale.supportTickets" },
          { id: "appointments", labelKey: "WorkspaceSetup.options.afterSale.appointments" },
          { id: "nothing", labelKey: "WorkspaceSetup.options.afterSale.nothing" },
        ],
      },
    ],
  },
  {
    id: "afterSaleDetails",
    number: 10,
    screen: "afterSale",
    parts: [
      {
        id: "projectPhases",
        labelKey: "WorkspaceSetup.questions.projectPhases.label",
        format: "orderedList",
        winChance: false,
        maxItems: 12,
        prefill: "suggested",
        visibleWhen: { part: "afterSale", includes: "projects" },
      },
      {
        id: "orderStatuses",
        labelKey: "WorkspaceSetup.questions.orderStatuses.label",
        format: "orderedList",
        winChance: false,
        maxItems: 12,
        prefill: "suggested",
        visibleWhen: { part: "afterSale", includes: "ordersInvoices" },
      },
      {
        id: "renewalPeriod",
        labelKey: "WorkspaceSetup.questions.renewalPeriod.label",
        format: "singleChoice",
        prefill: "suggested",
        visibleWhen: { part: "afterSale", includes: "contractsRenewals" },
        options: [
          { id: "monthly", labelKey: "WorkspaceSetup.options.renewalPeriod.monthly" },
          { id: "quarterly", labelKey: "WorkspaceSetup.options.renewalPeriod.quarterly" },
          { id: "yearly", labelKey: "WorkspaceSetup.options.renewalPeriod.yearly" },
          { id: "multiYear", labelKey: "WorkspaceSetup.options.renewalPeriod.multiYear" },
        ],
      },
      {
        id: "ticketPriorities",
        labelKey: "WorkspaceSetup.questions.ticketPriorities.label",
        format: "orderedList",
        winChance: false,
        maxItems: 8,
        prefill: "suggested",
        visibleWhen: { part: "afterSale", includes: "supportTickets" },
      },
      {
        id: "appointmentTypes",
        labelKey: "WorkspaceSetup.questions.appointmentTypes.label",
        format: "orderedList",
        winChance: false,
        maxItems: 12,
        prefill: "suggested",
        visibleWhen: { part: "afterSale", includes: "appointments" },
      },
    ],
  },
  {
    id: "tasks",
    number: 11,
    screen: "afterSale",
    parts: [
      {
        id: "taskOrganisation",
        labelKey: "WorkspaceSetup.questions.taskOrganisation.label",
        format: "multipleChoice",
        allowCustom: false,
        prefill: "no",
        options: [
          { id: "perDeal", labelKey: "WorkspaceSetup.options.taskOrganisation.perDeal" },
          { id: "perProject", labelKey: "WorkspaceSetup.options.taskOrganisation.perProject" },
          { id: "perCustomer", labelKey: "WorkspaceSetup.options.taskOrganisation.perCustomer" },
          { id: "recurring", labelKey: "WorkspaceSetup.options.taskOrganisation.recurring" },
        ],
      },
    ],
  },
  {
    id: "weeklyNumbers",
    number: 12,
    screen: "dashboard",
    parts: [
      {
        id: "weeklyNumbers",
        labelKey: "WorkspaceSetup.questions.weeklyNumbers.label",
        format: "rankedPick",
        maxPicks: SETUP_MAX_RANKED_PICKS,
        prefill: "no",
        options: [
          { id: "pipelineValue", labelKey: "WorkspaceSetup.options.weeklyNumbers.pipelineValue" },
          { id: "wonThisMonth", labelKey: "WorkspaceSetup.options.weeklyNumbers.wonThisMonth" },
          { id: "forecast", labelKey: "WorkspaceSetup.options.weeklyNumbers.forecast" },
          { id: "newLeads", labelKey: "WorkspaceSetup.options.weeklyNumbers.newLeads" },
          { id: "conversionByStage", labelKey: "WorkspaceSetup.options.weeklyNumbers.conversionByStage" },
          { id: "overdueTasks", labelKey: "WorkspaceSetup.options.weeklyNumbers.overdueTasks" },
          { id: "openTickets", labelKey: "WorkspaceSetup.options.weeklyNumbers.openTickets" },
          { id: "recurringRevenue", labelKey: "WorkspaceSetup.options.weeklyNumbers.recurringRevenue" },
          { id: "renewalsDue", labelKey: "WorkspaceSetup.options.weeklyNumbers.renewalsDue" },
        ],
      },
    ],
  },
  {
    id: "dashboardAudience",
    number: 13,
    screen: "dashboard",
    parts: [
      {
        id: "dashboardAudience",
        labelKey: "WorkspaceSetup.questions.dashboardAudience.label",
        format: "singleChoice",
        prefill: "no",
        options: [
          { id: "me", labelKey: "WorkspaceSetup.options.dashboardAudience.me" },
          { id: "team", labelKey: "WorkspaceSetup.options.dashboardAudience.team" },
          { id: "management", labelKey: "WorkspaceSetup.options.dashboardAudience.management" },
        ],
      },
    ],
  },
  {
    id: "knowledgePages",
    number: 14,
    screen: "knowledge",
    parts: [
      {
        id: "knowledgePages",
        labelKey: "WorkspaceSetup.questions.knowledgePages.label",
        format: "multipleChoice",
        allowCustom: false,
        prefill: "yes",
        options: [
          { id: "overview", labelKey: "WorkspaceSetup.options.knowledgePages.overview", preselected: true },
          {
            id: "productsPricing",
            labelKey: "WorkspaceSetup.options.knowledgePages.productsPricing",
            preselected: true,
          },
          { id: "idealCustomer", labelKey: "WorkspaceSetup.options.knowledgePages.idealCustomer", preselected: true },
          { id: "salesPlaybook", labelKey: "WorkspaceSetup.options.knowledgePages.salesPlaybook", preselected: true },
          { id: "faq", labelKey: "WorkspaceSetup.options.knowledgePages.faq", preselected: true },
          { id: "processes", labelKey: "WorkspaceSetup.options.knowledgePages.processes", preselected: true },
        ],
      },
    ],
  },
  {
    id: "addressForm",
    number: 15,
    screen: "knowledge",
    parts: [
      {
        id: "addressForm",
        labelKey: "WorkspaceSetup.questions.addressForm.label",
        format: "singleChoice",
        prefill: "yes",
        options: [
          { id: "formal", labelKey: "WorkspaceSetup.options.addressForm.formal" },
          { id: "informal", labelKey: "WorkspaceSetup.options.addressForm.informal" },
        ],
      },
    ],
  },
  {
    id: "competitors",
    number: 16,
    screen: "knowledge",
    parts: [
      {
        id: "competitors",
        labelKey: "WorkspaceSetup.questions.competitors.label",
        format: "orderedList",
        winChance: false,
        maxItems: 10,
        optional: true,
        prefill: "suggested",
      },
    ],
  },
  {
    id: "existingData",
    number: 17,
    screen: "data",
    parts: [
      {
        id: "existingData",
        labelKey: "WorkspaceSetup.questions.existingData.label",
        format: "singleChoice",
        upload: true,
        prefill: "no",
        options: [
          { id: "sampleData", labelKey: "WorkspaceSetup.options.existingData.sampleData" },
          { id: "spreadsheet", labelKey: "WorkspaceSetup.options.existingData.spreadsheet" },
          { id: "empty", labelKey: "WorkspaceSetup.options.existingData.empty" },
        ],
      },
      {
        id: "anythingMissed",
        labelKey: "WorkspaceSetup.questions.anythingMissed.label",
        format: "shortText",
        maxLength: 1_000,
        optional: true,
        prefill: "no",
      },
    ],
  },
];

export const SETUP_PARTS: SetupQuestionPart[] = SETUP_QUESTIONS.flatMap((question) => question.parts);

export const SETUP_PART_IDS = SETUP_PARTS.map((part) => part.id) as [string, ...string[]];

export function setupPart(id: string): SetupQuestionPart | undefined {
  return SETUP_PARTS.find((part) => part.id === id);
}
