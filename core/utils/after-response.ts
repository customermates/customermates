import { after } from "next/server";

import { transactionStorage } from "@/core/decorators/transaction-context";

export function runAfterResponse(task: () => Promise<unknown>): void {
  const store = transactionStorage.getStore();
  if (store) store.afterCommit.push(() => new Promise((resolve) => resolve(after(task))));
  else after(task);
}
