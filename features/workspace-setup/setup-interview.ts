import type { SetupAnswers } from "./setup-answers.schema";

export const SETUP_SCREENS = ["workspace", "winning", "afterSale", "dashboard", "knowledge", "data"] as const;
export type SetupScreen = (typeof SETUP_SCREENS)[number];

export const SETUP_QUESTION_FORMATS = [
  "singleChoice",
  "multipleChoice",
  "orderedList",
  "rankedPick",
  "range",
  "shortText",
] as const;

export const SETUP_PREFILL_LEVELS = ["yes", "partly", "suggested", "no"] as const;
type SetupPrefillLevel = (typeof SETUP_PREFILL_LEVELS)[number];

export const SETUP_OPTION_SOURCES = ["countries", "currencies", "locales"] as const;
export type SetupOptionSource = (typeof SETUP_OPTION_SOURCES)[number];

const SETUP_MAX_RANKED_PICKS = 3;
export const SETUP_MAX_FOLLOW_UP_QUESTIONS = 3;
export const SETUP_PREFILL_CONFIDENCE = 0.7;

export type SetupVisibility = { part: string; anyOf: string[] };

export type SetupOption = { id: string; labelKey: string; preselected?: boolean; visibleWhen?: SetupVisibility };

type SetupPartBase = {
  id: string;
  labelKey: string;
  prefill: SetupPrefillLevel;
  optional?: boolean;
  visibleWhen?: SetupVisibility;
};

export type SetupQuestionPart = SetupPartBase &
  (
    | { format: "singleChoice"; options: SetupOption[]; optionSource?: undefined; upload?: boolean }
    | { format: "singleChoice"; options: []; optionSource: SetupOptionSource; upload?: undefined }
    | { format: "multipleChoice"; options: SetupOption[]; allowCustom: boolean }
    | { format: "orderedList"; winChance: boolean; maxItems: number }
    | { format: "rankedPick"; options: SetupOption[]; maxPicks: number }
    | { format: "range"; unit: "currency" | "days"; single: boolean; min: number; max: number }
    | { format: "shortText"; maxLength: number; placeholderKey?: string }
  );

export type SetupQuestion = {
  id: string;
  number: number;
  screen: SetupScreen;
  visibleWhen?: SetupVisibility;
  parts: SetupQuestionPart[];
};

type SetupScreenDefinition = { id: SetupScreen; titleKey: string };

export const SETUP_SCREEN_DEFINITIONS: SetupScreenDefinition[] = [
  { id: "workspace", titleKey: "WorkspaceSetup.screens.workspace" },
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

const FOR_CLIENTS: SetupVisibility = { part: "purpose", anyOf: ["clients"] };

export const SETUP_QUESTIONS: SetupQuestion[] = [
  {
    id: "workspace",
    number: 1,
    screen: "workspace",
    parts: [
      {
        id: "purpose",
        labelKey: "WorkspaceSetup.questions.purpose.label",
        format: "multipleChoice",
        allowCustom: true,
        prefill: "partly",
        options: [
          { id: "clients", labelKey: "WorkspaceSetup.options.purpose.clients" },
          { id: "projects", labelKey: "WorkspaceSetup.options.purpose.projects" },
          { id: "marketing", labelKey: "WorkspaceSetup.options.purpose.marketing" },
          { id: "finances", labelKey: "WorkspaceSetup.options.purpose.finances" },
          { id: "hiring", labelKey: "WorkspaceSetup.options.purpose.hiring" },
          { id: "support", labelKey: "WorkspaceSetup.options.purpose.support" },
        ],
      },
      {
        id: "purposeDetails",
        optional: true,
        labelKey: "WorkspaceSetup.questions.purposeDetails.label",
        format: "shortText",
        maxLength: 300,
        placeholderKey: "WorkspaceSetup.questions.purposeDetails.placeholder",
        prefill: "partly",
      },
      {
        id: "companyName",
        optional: true,
        labelKey: "WorkspaceSetup.questions.companyName.label",
        format: "shortText",
        maxLength: 120,
        prefill: "yes",
      },
      {
        id: "country",
        optional: true,
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
    screen: "workspace",
    visibleWhen: FOR_CLIENTS,
    parts: [
      {
        id: "offeringKinds",
        optional: true,
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
        optional: true,
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
    screen: "workspace",
    visibleWhen: FOR_CLIENTS,
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
        optional: true,
        labelKey: "WorkspaceSetup.questions.industries.label",
        format: "multipleChoice",
        allowCustom: true,
        prefill: "yes",
        options: [],
      },
      {
        id: "customerSize",
        optional: true,
        labelKey: "WorkspaceSetup.questions.customerSize.label",
        format: "singleChoice",
        prefill: "partly",
        visibleWhen: { part: "customerKind", anyOf: ["businesses"] },
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
    screen: "workspace",
    parts: [
      {
        id: "teamSize",
        optional: true,
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
        optional: true,
        visibleWhen: FOR_CLIENTS,
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
    visibleWhen: FOR_CLIENTS,
    parts: [
      {
        id: "leadSources",
        optional: true,
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
    visibleWhen: FOR_CLIENTS,
    parts: [
      {
        id: "salesSteps",
        optional: true,
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
    visibleWhen: FOR_CLIENTS,
    parts: [
      {
        id: "dealSize",
        optional: true,
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
        optional: true,
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
        optional: true,
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
    visibleWhen: FOR_CLIENTS,
    parts: [
      {
        id: "dealDetails",
        optional: true,
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
    visibleWhen: FOR_CLIENTS,
    parts: [
      {
        id: "afterSale",
        optional: true,
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
    visibleWhen: FOR_CLIENTS,
    parts: [
      {
        id: "projectPhases",
        optional: true,
        labelKey: "WorkspaceSetup.questions.projectPhases.label",
        format: "orderedList",
        winChance: false,
        maxItems: 12,
        prefill: "suggested",
        visibleWhen: { part: "afterSale", anyOf: ["projects"] },
      },
      {
        id: "orderStatuses",
        optional: true,
        labelKey: "WorkspaceSetup.questions.orderStatuses.label",
        format: "orderedList",
        winChance: false,
        maxItems: 12,
        prefill: "suggested",
        visibleWhen: { part: "afterSale", anyOf: ["ordersInvoices"] },
      },
      {
        id: "renewalPeriod",
        optional: true,
        labelKey: "WorkspaceSetup.questions.renewalPeriod.label",
        format: "singleChoice",
        prefill: "suggested",
        visibleWhen: { part: "afterSale", anyOf: ["contractsRenewals"] },
        options: [
          { id: "monthly", labelKey: "WorkspaceSetup.options.renewalPeriod.monthly" },
          { id: "quarterly", labelKey: "WorkspaceSetup.options.renewalPeriod.quarterly" },
          { id: "yearly", labelKey: "WorkspaceSetup.options.renewalPeriod.yearly" },
          { id: "multiYear", labelKey: "WorkspaceSetup.options.renewalPeriod.multiYear" },
        ],
      },
      {
        id: "ticketPriorities",
        optional: true,
        labelKey: "WorkspaceSetup.questions.ticketPriorities.label",
        format: "orderedList",
        winChance: false,
        maxItems: 8,
        prefill: "suggested",
        visibleWhen: { part: "afterSale", anyOf: ["supportTickets"] },
      },
      {
        id: "appointmentTypes",
        optional: true,
        labelKey: "WorkspaceSetup.questions.appointmentTypes.label",
        format: "orderedList",
        winChance: false,
        maxItems: 12,
        prefill: "suggested",
        visibleWhen: { part: "afterSale", anyOf: ["appointments"] },
      },
    ],
  },
  {
    id: "tasks",
    number: 11,
    screen: "afterSale",
    visibleWhen: FOR_CLIENTS,
    parts: [
      {
        id: "taskOrganisation",
        optional: true,
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
    visibleWhen: FOR_CLIENTS,
    parts: [
      {
        id: "weeklyNumbers",
        optional: true,
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
    visibleWhen: FOR_CLIENTS,
    parts: [
      {
        id: "dashboardAudience",
        optional: true,
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
        optional: true,
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
            visibleWhen: FOR_CLIENTS,
          },
          {
            id: "idealCustomer",
            labelKey: "WorkspaceSetup.options.knowledgePages.idealCustomer",
            preselected: true,
            visibleWhen: FOR_CLIENTS,
          },
          {
            id: "salesPlaybook",
            labelKey: "WorkspaceSetup.options.knowledgePages.salesPlaybook",
            preselected: true,
            visibleWhen: FOR_CLIENTS,
          },
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
        optional: true,
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
    visibleWhen: FOR_CLIENTS,
    parts: [
      {
        id: "competitors",
        optional: true,
        labelKey: "WorkspaceSetup.questions.competitors.label",
        format: "orderedList",
        winChance: false,
        maxItems: 10,
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
        optional: true,
        labelKey: "WorkspaceSetup.questions.anythingMissed.label",
        format: "shortText",
        maxLength: 1_000,
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

const SINGLE_CHOICE_COVERS: Readonly<Record<string, readonly string[]>> = { both: ["businesses", "consumers"] };

function setupQuestionOf(partId: string): SetupQuestion | undefined {
  return SETUP_QUESTIONS.find((question) => question.parts.some((part) => part.id === partId));
}

function conditionMet(condition: SetupVisibility | undefined, answers: SetupAnswers): boolean {
  if (!condition) return true;
  if (!setupPartVisible(condition.part, answers)) return false;
  const value = answers[condition.part]?.value;
  if (value?.format === "multipleChoice") return condition.anyOf.some((id) => value.values.includes(id));
  if (value?.format === "singleChoice") {
    return condition.anyOf.some(
      (id) => value.value === id || (SINGLE_CHOICE_COVERS[value.value]?.includes(id) ?? false),
    );
  }
  return false;
}

export function setupPartVisible(partId: string, answers: SetupAnswers): boolean {
  const question = setupQuestionOf(partId);
  const part = setupPart(partId);
  return (
    Boolean(question && part) &&
    conditionMet(question?.visibleWhen, answers) &&
    conditionMet(part?.visibleWhen, answers)
  );
}

export function setupOptionVisible(option: Pick<SetupOption, "visibleWhen">, answers: SetupAnswers): boolean {
  return conditionMet(option.visibleWhen, answers);
}

export function setupVisibleAnswers(answers: SetupAnswers): SetupAnswers {
  const visible: SetupAnswers = {};
  for (const [id, answer] of Object.entries(answers)) {
    const part = setupPart(id);
    if (!answer || !part || !setupPartVisible(id, answers)) continue;
    const hidden = new Set(
      "options" in part
        ? part.options.filter((option) => !setupOptionVisible(option, answers)).map(({ id }) => id)
        : [],
    );
    const value = answer.value;
    if (value.format === "multipleChoice" || value.format === "rankedPick")
      visible[id] = { ...answer, value: { ...value, values: value.values.filter((choice) => !hidden.has(choice)) } };
    else if (value.format === "singleChoice" && hidden.has(value.value)) continue;
    else visible[id] = answer;
  }
  return visible;
}
