import { AsyncLocalStorage } from "node:async_hooks";

import { AUTOMATION_LOOP_DEPTH_LIMIT } from "./automation-rule.schema";

type AutomationCausationContext = { chain: string[] };

const automationContextStorage = new AsyncLocalStorage<AutomationCausationContext>();

export function runInAutomationContext<T>(context: AutomationCausationContext, fn: () => T | Promise<T>): Promise<T> {
  return automationContextStorage.run(context, () => Promise.resolve(fn()));
}

export function currentAutomationChain(): string[] | undefined {
  const chain = automationContextStorage.getStore()?.chain;
  return chain && chain.length > 0 ? chain : undefined;
}

export function mayTriggerAutomationRule(ruleId: string, causeChain: readonly string[] | undefined): boolean {
  if (!causeChain || causeChain.length === 0) return true;
  if (causeChain.includes(ruleId)) return false;
  return causeChain.length <= AUTOMATION_LOOP_DEPTH_LIMIT;
}

export function extendAutomationChain(causeChain: readonly string[] | undefined, ruleId: string): string[] {
  return [...(causeChain ?? []), ruleId];
}
