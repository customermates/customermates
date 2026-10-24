import { afterCommit } from "../decorators/after-commit";
import { getTransactionClient } from "../decorators/transaction-context";
import { runInTransaction } from "../decorators/transaction-runner";

import { UserAccessor } from "./user-accessor";

import { prisma } from "@/prisma/db";

export abstract class TenantRepository extends UserAccessor {
  public get prisma() {
    return getTransactionClient<typeof prisma>() ?? prisma;
  }

  protected runAfterCommit(fn: () => Promise<void>): Promise<void> {
    return afterCommit(fn);
  }

  protected withCompanyTransaction<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
    return runInTransaction(fn, { companyId });
  }
}
