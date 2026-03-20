import { getTransactionClient, transactionStorage } from "./transaction-context";

import { prisma } from "@/prisma/db";

export function Transaction(
  target: any,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const client = getTransactionClient<typeof prisma>() ?? prisma;
    if (!client.$transaction) return await originalMethod.apply(this, args);

    return await client.$transaction(async (tx: any) => {
      return await transactionStorage.run(tx, () => originalMethod.apply(this, args));
    });
  };

  return descriptor;
}
