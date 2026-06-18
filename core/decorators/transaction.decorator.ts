import { runInTransaction } from "./transaction-runner";

export function Transaction(
  target: any,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    return runInTransaction(() => originalMethod.apply(this, args));
  };

  return descriptor;
}
