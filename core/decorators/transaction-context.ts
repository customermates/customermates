import type { AppPrismaClient } from "@/prisma/db";

import { AsyncLocalStorage } from "node:async_hooks";

import type { Prisma, Webhook } from "@/generated/prisma";

export type TransactionStore = {
  client: AppPrismaClient;
  auditLogBatch: Prisma.AuditLogCreateManyInput[];
  webhookDeliveryBatch: Prisma.WebhookDeliveryCreateManyInput[];
  afterCommit: (() => Promise<void>)[];
  enabledWebhooks: Webhook[] | null;
};

export const transactionStorage = new AsyncLocalStorage<TransactionStore>();

export function getTransactionClient<T extends AppPrismaClient>(): T | undefined {
  return transactionStorage.getStore()?.client as T | undefined;
}
