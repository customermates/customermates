import type { TenantUser } from "@/features/user/user.schema";

import { getTenantUser, isTenantGuardBypassed } from "../decorators/tenant-context";
import { getTransactionClient, transactionStorage } from "../decorators/transaction-context";
import { runInTransaction } from "../decorators/transaction-runner";

import { prisma, type AppPrismaClient } from "@/prisma/db";

export function tenantPrisma() {
  return getTransactionClient<AppPrismaClient>() ?? prisma;
}

export function tenantUser(): TenantUser {
  if (isTenantGuardBypassed()) throw new Error("User is not available when tenant is bypassed");

  return getTenantUser();
}

export async function runAfterCommit(fn: () => Promise<void>): Promise<void> {
  const store = transactionStorage.getStore();
  if (store) store.afterCommit.push(fn);
  else await fn();
}

export function withCompanyTransaction<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  return runInTransaction(fn, { companyId });
}

export abstract class TenantRepository {
  public get prisma() {
    return tenantPrisma();
  }

  public get user(): TenantUser {
    return tenantUser();
  }

  public get companyId(): string {
    return this.user.companyId;
  }

  public get userId(): string {
    return this.user.id;
  }

  protected runAfterCommit(fn: () => Promise<void>): Promise<void> {
    return runAfterCommit(fn);
  }

  protected withCompanyTransaction<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
    return withCompanyTransaction(companyId, fn);
  }
}
