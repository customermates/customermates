import type { SetupAnswers } from "./setup-answers.schema";

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

export const SETUP_FOLLOW_UP_QUESTIONS = 1;
export const SETUP_PREFILL_CONFIDENCE = 0.7;

export const SETUP_BASICS_QUESTION = "basics";

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
    | { format: "orderedList"; maxItems: number }
    | { format: "rankedPick"; options: SetupOption[]; maxPicks: number }
    | { format: "range"; unit: "currency" | "days"; single: boolean; min: number; max: number }
    | { format: "shortText"; maxLength: number; placeholderKey?: string }
  );

export type SetupQuestion = {
  id: string;
  number: number;
  visibleWhen?: SetupVisibility;
  parts: SetupQuestionPart[];
};

export const SETUP_STEP_FLOWS = [
  "deals",
  "projects",
  "orders",
  "support",
  "hiring",
  "investors",
  "contracts",
  "partners",
  "marketing",
] as const;

const WITH_CUSTOMERS: SetupVisibility = { part: "workWith", anyOf: ["customers", "clients"] };

export const SETUP_QUESTIONS: SetupQuestion[] = [
  {
    id: "workWith",
    number: 1,
    parts: [
      {
        id: "workWith",
        labelKey: "WorkspaceSetup.questions.workWith.label",
        format: "singleChoice",
        prefill: "partly",
        options: [
          { id: "customers", labelKey: "WorkspaceSetup.options.workWith.customers" },
          { id: "clients", labelKey: "WorkspaceSetup.options.workWith.clients" },
          { id: "ownWork", labelKey: "WorkspaceSetup.options.workWith.ownWork" },
        ],
      },
    ],
  },
  {
    id: "purpose",
    number: 2,
    parts: [
      {
        id: "purpose",
        labelKey: "WorkspaceSetup.questions.purpose.label",
        format: "multipleChoice",
        allowCustom: true,
        prefill: "partly",
        options: [
          { id: "deals", labelKey: "WorkspaceSetup.options.purpose.deals" },
          { id: "projects", labelKey: "WorkspaceSetup.options.purpose.projects" },
          { id: "contracts", labelKey: "WorkspaceSetup.options.purpose.contracts" },
          { id: "orders", labelKey: "WorkspaceSetup.options.purpose.orders" },
          { id: "chats", labelKey: "WorkspaceSetup.options.purpose.chats" },
          { id: "support", labelKey: "WorkspaceSetup.options.purpose.support" },
          { id: "hiring", labelKey: "WorkspaceSetup.options.purpose.hiring" },
          { id: "investors", labelKey: "WorkspaceSetup.options.purpose.investors" },
          { id: "partners", labelKey: "WorkspaceSetup.options.purpose.partners" },
          { id: "finances", labelKey: "WorkspaceSetup.options.purpose.finances" },
          { id: "marketing", labelKey: "WorkspaceSetup.options.purpose.marketing" },
        ],
      },
    ],
  },
  {
    id: "mainSteps",
    number: 3,
    visibleWhen: { part: "purpose", anyOf: [...SETUP_STEP_FLOWS] },
    parts: [
      {
        id: "mainSteps",
        optional: true,
        labelKey: "WorkspaceSetup.questions.mainSteps.label",
        format: "orderedList",
        maxItems: 12,
        prefill: "suggested",
      },
    ],
  },
  {
    id: "pricing",
    number: 4,
    visibleWhen: WITH_CUSTOMERS,
    parts: [
      {
        id: "pricing",
        optional: true,
        labelKey: "WorkspaceSetup.questions.pricing.label",
        format: "singleChoice",
        prefill: "partly",
        options: [
          { id: "fixedPrice", labelKey: "WorkspaceSetup.options.pricing.fixedPrice" },
          { id: "timeBased", labelKey: "WorkspaceSetup.options.pricing.timeBased" },
          { id: "subscription", labelKey: "WorkspaceSetup.options.pricing.subscription" },
          { id: "products", labelKey: "WorkspaceSetup.options.pricing.products" },
          { id: "free", labelKey: "WorkspaceSetup.options.pricing.free" },
        ],
      },
    ],
  },
  {
    id: "team",
    number: 5,
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
          { id: "large", labelKey: "WorkspaceSetup.options.teamSize.large" },
        ],
      },
    ],
  },
  {
    id: "existingData",
    number: 6,
    parts: [
      {
        id: "existingData",
        labelKey: "WorkspaceSetup.questions.existingData.label",
        format: "singleChoice",
        upload: true,
        prefill: "no",
        options: [
          { id: "sampleData", labelKey: "WorkspaceSetup.options.existingData.sampleData" },
          { id: "empty", labelKey: "WorkspaceSetup.options.existingData.empty" },
          { id: "spreadsheet", labelKey: "WorkspaceSetup.options.existingData.spreadsheet" },
        ],
      },
    ],
  },
  {
    id: "purposeDetails",
    number: 7,
    parts: [
      {
        id: "purposeDetails",
        optional: true,
        labelKey: "WorkspaceSetup.questions.purposeDetails.label",
        format: "shortText",
        maxLength: 300,
        placeholderKey: "WorkspaceSetup.questions.purposeDetails.placeholder",
        prefill: "partly",
      },
    ],
  },
  {
    id: SETUP_BASICS_QUESTION,
    number: 8,
    parts: [
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
];

export const SETUP_PARTS: SetupQuestionPart[] = SETUP_QUESTIONS.flatMap((question) => question.parts);

export const SETUP_PART_IDS = SETUP_PARTS.map((part) => part.id) as [string, ...string[]];

export function setupPart(id: string): SetupQuestionPart | undefined {
  return SETUP_PARTS.find((part) => part.id === id);
}

function setupQuestionOf(partId: string): SetupQuestion | undefined {
  return SETUP_QUESTIONS.find((question) => question.parts.some((part) => part.id === partId));
}

function conditionMet(condition: SetupVisibility | undefined, answers: SetupAnswers): boolean {
  if (!condition) return true;
  if (!setupPartVisible(condition.part, answers)) return false;
  const value = answers[condition.part]?.value;
  if (value?.format === "multipleChoice") return condition.anyOf.some((id) => value.values.includes(id));
  if (value?.format === "singleChoice") return condition.anyOf.includes(value.value);

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
