"use server";

import { getGetAutomationRulesInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

const RULE_PAGE_SIZE = 100;

export async function getFormAutomationRulesAction() {
  return serializeResult(getGetAutomationRulesInteractor().invoke({ page: 1, pageSize: RULE_PAGE_SIZE, owner: "all" }));
}
