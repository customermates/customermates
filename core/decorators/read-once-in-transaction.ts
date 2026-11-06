import { transactionStorage } from "./transaction-context";

export function readOnceInTransaction<T>(key: string, load: () => Promise<T>): Promise<T> {
  const reads = transactionStorage.getStore()?.reads;
  if (!reads) return load();

  const existing = reads.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const pending = load().catch((error: unknown) => {
    if (reads.get(key) === pending) reads.delete(key);
    throw error;
  });
  reads.set(key, pending);
  return pending;
}
