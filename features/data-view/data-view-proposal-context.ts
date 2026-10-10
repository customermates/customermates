import { AsyncLocalStorage } from "node:async_hooks";

const proposalScope = new AsyncLocalStorage<true>();

export function runProposingDataViews<T>(run: () => T): T {
  return proposalScope.run(true, run);
}

export function proposesDataViews(): boolean {
  return proposalScope.getStore() === true;
}
