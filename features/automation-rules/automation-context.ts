import { AUTOMATION_LOOP_DEPTH_LIMIT } from "./automation-rule.schema";

export function mayTriggerAutomationRule(ruleId: string, causeChain: readonly string[] | undefined): boolean {
  if (!causeChain || causeChain.length === 0) return true;
  if (causeChain.includes(ruleId)) return false;
  return causeChain.length <= AUTOMATION_LOOP_DEPTH_LIMIT;
}

export function extendAutomationChain(causeChain: readonly string[] | undefined, ruleId: string): string[] {
  return [...(causeChain ?? []), ruleId];
}
