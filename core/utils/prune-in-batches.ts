export const PRUNE_BATCH_LIMIT = 1_000;
export const PRUNE_MAX_BATCHES = 100;

export async function pruneInBatches(deleteBatch: (limit: number) => Promise<number>): Promise<number> {
  let pruned = 0;
  for (let batch = 0; batch < PRUNE_MAX_BATCHES; batch++) {
    const deleted = await deleteBatch(PRUNE_BATCH_LIMIT);
    pruned += deleted;
    if (deleted < PRUNE_BATCH_LIMIT) break;
  }
  return pruned;
}
