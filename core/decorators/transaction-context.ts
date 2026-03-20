import { AsyncLocalStorage } from "node:async_hooks";

export const transactionStorage = new AsyncLocalStorage<unknown>();

export function getTransactionClient<T>(): T | undefined {
  return transactionStorage.getStore() as T | undefined;
}
