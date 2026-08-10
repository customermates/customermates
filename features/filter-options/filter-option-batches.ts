export const FILTER_OPTION_BATCH_SIZE = 100;
export const FILTER_OPTION_BATCH_CONCURRENCY = 2;

export function filterOptionBatches(ids: readonly string[]): string[][] {
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += FILTER_OPTION_BATCH_SIZE)
    batches.push(ids.slice(index, index + FILTER_OPTION_BATCH_SIZE));
  return batches;
}

export async function resolveFilterOptionBatches<T>(
  ids: readonly string[],
  resolveBatch: (batch: readonly string[]) => Promise<T[]>,
): Promise<T[]> {
  const batches = filterOptionBatches(ids);
  const results: T[][] = [];
  let nextBatchIndex = 0;

  async function resolveNextBatch(): Promise<void> {
    const batchIndex = nextBatchIndex;
    nextBatchIndex += 1;
    const batch = batches[batchIndex];
    if (!batch) return;

    results[batchIndex] = await resolveBatch(batch);
    await resolveNextBatch();
  }

  const workerCount = Math.min(FILTER_OPTION_BATCH_CONCURRENCY, batches.length);
  await Promise.all(Array.from({ length: workerCount }, () => resolveNextBatch()));
  return results.flat();
}
