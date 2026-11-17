"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type {
  AutomationRuleIdData,
  GetAutomationRuleRunsData,
  GetAutomationRulesData,
  PreviewAutomationRuleData,
  SetAutomationRuleEnabledData,
  UpsertAutomationRuleData,
} from "@/features/automation-rules/automation-rule.schema";
import type { ComposeAutomationData } from "@/ee/automation-compose/compose-automation.schema";

import {
  getComposeAutomationInteractor,
  getDeleteAutomationRuleInteractor,
  getGetAutomationRuleRunsInteractor,
  getGetAutomationRulesInteractor,
  getGetAutomationsListInteractor,
  getPreviewAutomationRuleInteractor,
  getSetAutomationRuleEnabledInteractor,
  getUpsertAutomationRuleInteractor,
} from "@/core/di";
import { serializeResult, serializeTypedResult } from "@/core/utils/action-result";

export async function getAutomationsListAction(params?: GetQueryParams) {
  return serializeTypedResult(getGetAutomationsListInteractor().invoke(params));
}

export async function getAutomationRulesAction(data: GetAutomationRulesData) {
  return serializeTypedResult(getGetAutomationRulesInteractor().invoke(data));
}

export async function upsertAutomationRuleAction(data: UpsertAutomationRuleData) {
  return serializeResult(getUpsertAutomationRuleInteractor().invoke(data));
}

export async function setAutomationRuleEnabledAction(data: SetAutomationRuleEnabledData) {
  return serializeResult(getSetAutomationRuleEnabledInteractor().invoke(data));
}

export async function deleteAutomationRuleAction(data: AutomationRuleIdData) {
  return serializeResult(getDeleteAutomationRuleInteractor().invoke(data));
}

export async function getAutomationRuleRunsAction(data: GetAutomationRuleRunsData) {
  return serializeTypedResult(getGetAutomationRuleRunsInteractor().invoke(data));
}

export async function previewAutomationRuleAction(data: PreviewAutomationRuleData) {
  return serializeTypedResult(getPreviewAutomationRuleInteractor().invoke(data));
}

export async function composeAutomationAction(data: ComposeAutomationData) {
  return serializeTypedResult(getComposeAutomationInteractor().invoke(data));
}
