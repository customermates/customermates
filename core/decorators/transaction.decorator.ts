import { runInTransaction } from "./transaction-runner";

type TransactionOptions = { timeout?: number; maxWait?: number };

export const BULK_WRITE_TRANSACTION: TransactionOptions = { timeout: 30000, maxWait: 10000 };

function applyTransaction(descriptor: PropertyDescriptor, options?: TransactionOptions): PropertyDescriptor {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    return runInTransaction(() => originalMethod.apply(this, args), options);
  };

  return descriptor;
}

export function Transaction(
  optionsOrTarget?: any,
  propertyKey?: string | symbol,
  descriptor?: PropertyDescriptor,
): any {
  if (descriptor && propertyKey !== undefined) return applyTransaction(descriptor);

  const options = optionsOrTarget as TransactionOptions | undefined;
  return (_target: any, _propertyKey: string | symbol, innerDescriptor: PropertyDescriptor) =>
    applyTransaction(innerDescriptor, options);
}
