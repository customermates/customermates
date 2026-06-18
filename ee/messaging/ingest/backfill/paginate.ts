export const UNIPILE_MAX_LIMIT = 250;
export const PAGE_SAFETY = 50;
export const BACKFILL_MAX_MESSAGES = 5000;

export async function paginate(opts: {
  fetchPage: (cursor: string | undefined) => Promise<{ items?: unknown[]; cursor?: string | null }>;
  handleItem: (item: unknown) => Promise<number>;
  onPageEnd?: (cursor: string | null) => Promise<void>;
  startCursor?: string;
  budget?: number;
}): Promise<number> {
  const budget = opts.budget ?? BACKFILL_MAX_MESSAGES;
  let processed = 0;
  let cursor = opts.startCursor;

  for (let page = 0; page < PAGE_SAFETY; page++) {
    if (processed >= budget) break;

    const result = await opts.fetchPage(cursor);

    for (const item of result.items ?? []) {
      if (processed >= budget) break;

      processed += await opts.handleItem(item);
    }

    await opts.onPageEnd?.(result.cursor ?? null);

    cursor = result.cursor ?? undefined;
    if (!cursor) break;
  }

  return processed;
}

export async function paginateNested<TContext>(opts: {
  fetchOuterPage: (cursor: string | undefined) => Promise<{ items?: unknown[]; cursor?: string | null }>;
  mapOuter: (outerItem: unknown) => Promise<TContext | null>;
  fetchInnerPage: (
    context: TContext,
    cursor: string | undefined,
  ) => Promise<{ items?: unknown[]; cursor?: string | null }>;
  handleInner: (context: TContext, innerItem: unknown) => Promise<number>;
  onOuterPageEnd?: (cursor: string | null, processed: number, budget: number) => Promise<void>;
  startCursor?: string;
  budget?: number;
}): Promise<{ processed: number; sawOuter: boolean }> {
  const budget = opts.budget ?? BACKFILL_MAX_MESSAGES;
  let processed = 0;
  let sawOuter = false;
  let cursor = opts.startCursor;

  for (let page = 0; page < PAGE_SAFETY; page++) {
    if (processed >= budget) break;

    const result = await opts.fetchOuterPage(cursor);

    for (const outerItem of result.items ?? []) {
      if (processed >= budget) break;

      const context = await opts.mapOuter(outerItem);
      if (context === null) continue;

      sawOuter = true;
      processed += await paginate({
        fetchPage: (innerCursor) => opts.fetchInnerPage(context, innerCursor),
        handleItem: (item) => opts.handleInner(context, item),
        budget: budget - processed,
      });
    }

    await opts.onOuterPageEnd?.(result.cursor ?? null, processed, budget);

    cursor = result.cursor ?? undefined;
    if (!cursor) break;
  }

  return { processed, sawOuter };
}
