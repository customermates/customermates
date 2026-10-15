import type { SetupPlan } from "./setup-plan.schema";

export const SETUP_LIST_ROLES = ["people", "tasks", "deals", "offerings"] as const;
export type SetupListRole = (typeof SETUP_LIST_ROLES)[number];

export const SETUP_REQUIRED_LIST_ROLES: readonly SetupListRole[] = ["people", "tasks"];

export const SETUP_ROLE_FIELDS: Readonly<Record<SetupListRole, readonly string[]>> = {
  people: ["channels", "avatar"],
  tasks: [],
  deals: ["value"],
  offerings: ["price"],
};

export const SETUP_LINE_ITEM_LIST = "lineItem";
export const SETUP_LINE_ITEM_DEAL = "lineItemDeal";
export const SETUP_LINE_ITEM_OFFERING = "lineItemOffering";
export const SETUP_LINE_ITEM_FIELDS = ["quantity", "pricingMode", "savedPrice", "effectivePrice", "amount"] as const;
export const SETUP_DEAL_OFFERINGS_PATH = "dealOfferings";
export const SETUP_OFFERING_DEALS_PATH = "offeringDeals";
export const SETUP_AVATAR_CAPABILITY = "avatar";
export const SETUP_MEMBERSHIP_CAPABILITY = "membership";

type PlannedLists = Pick<SetupPlan, "recordModel">;

export function setupRoleList(plan: PlannedLists, role: SetupListRole): string | null {
  return plan.recordModel.lists.find((list) => list.role === role)?.key ?? null;
}

export function setupLineItems(plan: PlannedLists): { deals: string; offerings: string } | null {
  const deals = setupRoleList(plan, "deals");
  const offerings = setupRoleList(plan, "offerings");
  return deals && offerings ? { deals, offerings } : null;
}

export function setupAnchorFields(lists: ReadonlyArray<{ key: string; role?: SetupListRole | null }>): string[] {
  return lists.flatMap((list) => (list.role ? SETUP_ROLE_FIELDS[list.role].map((name) => `${list.key}.${name}`) : []));
}

export function setupLineItemField(name: (typeof SETUP_LINE_ITEM_FIELDS)[number]): string {
  return `${SETUP_LINE_ITEM_LIST}.${name}`;
}
