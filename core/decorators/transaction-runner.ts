import * as Sentry from "@sentry/nextjs";

import { getTransactionClient, transactionStorage } from "./transaction-context";
import { tenantStorage } from "./tenant-context";

import { prisma, type AppPrismaClient } from "@/prisma/db";
import { isInteractorFailure, type InteractorOutcome } from "@/core/validation/validation.utils";

class InteractorFailureRollback extends Error {
  constructor(public readonly failure: Extract<InteractorOutcome<never>, { ok: false }>) {
    super("Rolling back an expected interactor failure.");
  }
}

export async function runInTransaction<T>(
  fn: () => Promise<T>,
  options?: { companyId?: string; timeout?: number; maxWait?: number },
): Promise<T> {
  const client = getTransactionClient<AppPrismaClient>() ?? prisma;
  if (!client.$transaction) return await fn();

  const txStore: { value: ReturnType<typeof transactionStorage.getStore> } = { value: undefined };

  const transactionOptions =
    options?.timeout || options?.maxWait ? { timeout: options.timeout, maxWait: options.maxWait } : undefined;

  let result: T;
  try {
    result = await client.$transaction(async (tx: any) => {
      const store = tenantStorage.getStore();
      const companyId = options?.companyId ?? (store?.bypass || !store?.user ? undefined : store.user.companyId);
      if (companyId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${companyId}, 0))`;

      return await transactionStorage.run(
        {
          client: tx,
          auditLogBatch: [],
          webhookDeliveryBatch: [],
          afterCommit: [],
          enabledWebhooks: null,
        },
        async () => {
          const callResult = await fn();
          if (isInteractorFailure(callResult)) throw new InteractorFailureRollback(callResult);

          const inner = transactionStorage.getStore();
          txStore.value = inner;

          const { auditLogBatch, webhookDeliveryBatch } = inner ?? {};

          if (auditLogBatch?.length) await tx.auditLog.createMany({ data: auditLogBatch });
          if (webhookDeliveryBatch?.length) await tx.webhookDelivery.createMany({ data: webhookDeliveryBatch });

          return callResult;
        },
      );
    }, transactionOptions);
  } catch (error) {
    if (error instanceof InteractorFailureRollback) return error.failure as T;
    throw error;
  }

  const afterCommit = txStore.value?.afterCommit;
  if (afterCommit?.length) {
    await Promise.all(
      afterCommit.map((commitFn) =>
        commitFn().catch((err: unknown) => {
          Sentry.captureException(err, {
            tags: { kind: "afterCommit-failure" },
          });
        }),
      ),
    );
  }

  return result;
}
