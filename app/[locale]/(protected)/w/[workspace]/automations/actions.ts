"use server";

import type {
  AutomationRuleIdData,
  GetAutomationRuleRunsData,
  SetAutomationRuleEnabledData,
  UpsertAutomationRuleInput,
} from "@/features/automation-rules/automation-rule.schema";

import {
  getDeleteAutomationRuleInteractor,
  getGetAutomationRuleRunsInteractor,
  getSetAutomationRuleEnabledInteractor,
  getUpsertAutomationRuleInteractor,
} from "@/core/di";
import { serializeResult, serializeTypedResult } from "@/core/utils/action-result";

export async function upsertAutomationRuleAction(data: UpsertAutomationRuleInput) {
  return serializeResult(getUpsertAutomationRuleInteractor().invoke(data as never));
}

export async function setAutomationRuleEnabledAction(data: SetAutomationRuleEnabledData) {
  return serializeResult(getSetAutomationRuleEnabledInteractor().invoke(data));
}

export async function deleteAutomationRuleAction(data: AutomationRuleIdData) {
  return serializeResult(getDeleteAutomationRuleInteractor().invoke(data));
}

export async function getAutomationRuleRunsAction(data: Pick<GetAutomationRuleRunsData, "id"> & Partial<GetAutomationRuleRunsData>) {
  return serializeTypedResult(getGetAutomationRuleRunsInteractor().invoke(data as GetAutomationRuleRunsData));
}
