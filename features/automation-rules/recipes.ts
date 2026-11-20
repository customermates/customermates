import type { AgentRuntimeKind } from "./automation-rule.schema";

export const AUTOMATION_RECIPE_IDS = [
  "answerEnquiries",
  "followUpAfterOffer",
  "remindBeforeRenewal",
  "welcomeSubmission",
  "chaseDocuments",
  "weeklyReview",
  "wonOrLostReason",
  "bookingCancelled",
] as const;
export type AutomationRecipeId = (typeof AUTOMATION_RECIPE_IDS)[number];

export const RECIPE_SLOTS = ["list", "stageField", "dateField", "reasonField"] as const;
export type RecipeSlot = (typeof RECIPE_SLOTS)[number];

export type RecipeTrigger =
  | { kind: "formSubmitted" }
  | { kind: "bookingChanged"; change: "cancelled" | "rescheduled" }
  | { kind: "stageChanged" }
  | { kind: "stageUpdated" }
  | { kind: "dateReached"; days: number; direction: "before" | "after"; atHour: number }
  | { kind: "schedule"; cron: string };

export type RecipeCondition = { kind: "reasonEmpty" };

export type RecipeEffect =
  | { kind: "notify"; notificationKind: "ruleAlert" | "dueToday"; text: number }
  | { kind: "createAction"; text: number; dueDays: number }
  | { kind: "agent"; runtime: AgentRuntimeKind; text: number };

export type AutomationRecipe = {
  id: AutomationRecipeId;
  kind: "rule" | "routine";
  cloudOnly: boolean;
  usesAgent: boolean;
  slots: readonly RecipeSlot[];
  trigger: RecipeTrigger;
  conditions: readonly RecipeCondition[];
  effects: readonly RecipeEffect[];
};

export const AUTOMATION_RECIPES: readonly AutomationRecipe[] = [
  {
    id: "answerEnquiries",
    kind: "rule",
    cloudOnly: false,
    usesAgent: true,
    slots: [],
    trigger: { kind: "formSubmitted" },
    conditions: [],
    effects: [
      { kind: "agent", runtime: "mate", text: 0 },
      { kind: "notify", notificationKind: "ruleAlert", text: 1 },
    ],
  },
  {
    id: "followUpAfterOffer",
    kind: "rule",
    cloudOnly: false,
    usesAgent: false,
    slots: ["list", "stageField"],
    trigger: { kind: "stageChanged" },
    conditions: [],
    effects: [
      { kind: "createAction", text: 0, dueDays: 3 },
      { kind: "notify", notificationKind: "ruleAlert", text: 1 },
    ],
  },
  {
    id: "remindBeforeRenewal",
    kind: "rule",
    cloudOnly: false,
    usesAgent: false,
    slots: ["list", "dateField"],
    trigger: { kind: "dateReached", days: 30, direction: "before", atHour: 7 },
    conditions: [],
    effects: [
      { kind: "createAction", text: 0, dueDays: 0 },
      { kind: "notify", notificationKind: "dueToday", text: 1 },
    ],
  },
  {
    id: "welcomeSubmission",
    kind: "rule",
    cloudOnly: false,
    usesAgent: false,
    slots: [],
    trigger: { kind: "formSubmitted" },
    conditions: [],
    effects: [
      { kind: "createAction", text: 0, dueDays: 1 },
      { kind: "notify", notificationKind: "ruleAlert", text: 1 },
    ],
  },
  {
    id: "chaseDocuments",
    kind: "rule",
    cloudOnly: false,
    usesAgent: false,
    slots: ["list", "dateField"],
    trigger: { kind: "dateReached", days: 7, direction: "after", atHour: 8 },
    conditions: [],
    effects: [
      { kind: "createAction", text: 0, dueDays: 0 },
      { kind: "notify", notificationKind: "ruleAlert", text: 1 },
    ],
  },
  {
    id: "weeklyReview",
    kind: "routine",
    cloudOnly: true,
    usesAgent: true,
    slots: [],
    trigger: { kind: "schedule", cron: "0 8 * * 1" },
    conditions: [],
    effects: [{ kind: "agent", runtime: "mate", text: 0 }],
  },
  {
    id: "wonOrLostReason",
    kind: "rule",
    cloudOnly: false,
    usesAgent: false,
    slots: ["list", "stageField", "reasonField"],
    trigger: { kind: "stageUpdated" },
    conditions: [{ kind: "reasonEmpty" }],
    effects: [{ kind: "notify", notificationKind: "ruleAlert", text: 0 }],
  },
  {
    id: "bookingCancelled",
    kind: "rule",
    cloudOnly: false,
    usesAgent: false,
    slots: [],
    trigger: { kind: "bookingChanged", change: "cancelled" },
    conditions: [],
    effects: [{ kind: "notify", notificationKind: "ruleAlert", text: 0 }],
  },
];

export function recipeById(id: string): AutomationRecipe | undefined {
  return AUTOMATION_RECIPES.find((recipe) => recipe.id === id);
}

export function availableRecipes(options: { cloud: boolean }): AutomationRecipe[] {
  return AUTOMATION_RECIPES.filter((recipe) => options.cloud || !recipe.cloudOnly);
}
