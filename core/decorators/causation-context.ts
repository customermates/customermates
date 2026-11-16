import { AsyncLocalStorage } from "node:async_hooks";

export type CausationContext = { routineDepth?: number; ruleChain?: readonly string[] };

const causationStorage = new AsyncLocalStorage<CausationContext>();

export function runInCausation<T>(context: CausationContext | null, fn: () => T | Promise<T>): Promise<T> {
  if (!context) return Promise.resolve(fn());

  return causationStorage.run(context, () => Promise.resolve(fn()));
}

export function currentCausation(): CausationContext | undefined {
  return causationStorage.getStore();
}
