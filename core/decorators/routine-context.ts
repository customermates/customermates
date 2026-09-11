import { AsyncLocalStorage } from "node:async_hooks";

export type RoutineCausationContext = { causationDepth: number };

export const routineContextStorage = new AsyncLocalStorage<RoutineCausationContext>();

export function runInRoutineContext<T>(context: RoutineCausationContext | null, fn: () => T | Promise<T>): Promise<T> {
  if (!context) return Promise.resolve(fn());

  return routineContextStorage.run(context, () => Promise.resolve(fn()));
}

export function currentRoutineContext(): RoutineCausationContext | undefined {
  return routineContextStorage.getStore();
}
