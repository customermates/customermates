import { transactionStorage } from "./transaction-context";

export async function afterCommit(fn: () => Promise<void>): Promise<void> {
  const store = transactionStorage.getStore();
  if (store) store.afterCommit.push(fn);
  else await fn();
}
