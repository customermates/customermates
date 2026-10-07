import { getTransactionClient, transactionStorage } from "../decorators/transaction-context";
import { runInTransaction } from "../decorators/transaction-runner";

import { UserAccessor } from "./user-accessor";

import { prisma } from "@/prisma/db";

export abstract class TenantRepository extends UserAccessor {
  public get prisma() {
    return getTransactionClient<typeof prisma>() ?? prisma;
  }

  protected async runAfterCommit(fn: () => Promise<void>): Promise<void> {
    const store = transactionStorage.getStore();
    if (store) store.afterCommit.push(fn);
    else await fn();
  }

  protected withCompanyTransaction<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
    return runInTransaction(fn, { companyId });
  }
}
