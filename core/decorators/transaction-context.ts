import type { AppPrismaClient } from "@/prisma/db";

import { AsyncLocalStorage } from "node:async_hooks";

type TransactionStore = {
  client: AppPrismaClient;
  afterCommit: (() => Promise<void>)[];
  eventWakeups: Set<string>;
};

export const transactionStorage = new AsyncLocalStorage<TransactionStore>();

export function getTransactionClient<T extends AppPrismaClient>(): T | undefined {
  return transactionStorage.getStore()?.client as T | undefined;
}
