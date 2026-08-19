import { isUnipileCursorPaginationRequired } from "../../messaging.service";

export const UNIPILE_MAX_LIMIT = 25;
export const UNIPILE_EMAIL_MAX_LIMIT = 100;
export const BACKFILL_EMAIL_TIMEOUT_MS = 90_000;
export const PAGE_SAFETY = 200;

const DAY_MS = 24 * 60 * 60 * 1000;
const BACKFILL_SINCE_DAYS = 365;

export function backfillSince(): Date {
  return new Date(Date.now() - BACKFILL_SINCE_DAYS * DAY_MS);
}

const MIN_UNIPILE_REQUEST_INTERVAL_MS = 250;
let lastUnipileRequestAt = 0;

async function paceUnipileRequest(): Promise<void> {
  const waitMs = lastUnipileRequestAt + MIN_UNIPILE_REQUEST_INTERVAL_MS - Date.now();
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastUnipileRequestAt = Date.now();
}

export type PageResult = { nextCursor: string | null; done: boolean };
export type PageQuery = { cursor?: string; offset?: number };
type FetchPage = (query: PageQuery) => Promise<{ data?: unknown[]; next_cursor?: string | null }>;

type Position = { cursor?: string; offset: number; mode?: "cursor" | "offset" };

function decodePosition(token: string | null): Position {
  if (!token) return { offset: 0 };
  if (token.startsWith("c:")) return { cursor: token.slice(2), offset: 0, mode: "cursor" };
  return { offset: Number(token) || 0, mode: "offset" };
}

export async function paginateStep(opts: {
  startCursor: string | null;
  limit: number;
  fetchPage: FetchPage;
  handleItem: (item: unknown) => Promise<void>;
}): Promise<PageResult> {
  const position = decodePosition(opts.startCursor);
  let cursor = position.cursor;
  let offset = position.offset;
  let mode = position.mode;

  for (let page = 0; page < PAGE_SAFETY; page++) {
    await paceUnipileRequest();

    let result;
    try {
      result = await opts.fetchPage(mode === "offset" ? { offset } : { cursor });
    } catch (error) {
      if (mode === "offset" && isUnipileCursorPaginationRequired(error)) return { nextCursor: null, done: true };
      throw error;
    }

    const items = result.data ?? [];

    for (const item of items) await opts.handleItem(item);

    if (!mode) mode = result.next_cursor ? "cursor" : "offset";

    if (mode === "cursor") {
      if (!result.next_cursor) return { nextCursor: null, done: true };
      cursor = result.next_cursor;
    } else {
      if (items.length < opts.limit) return { nextCursor: null, done: true };
      offset += items.length;
    }
  }

  return { nextCursor: mode === "cursor" ? `c:${cursor}` : String(offset), done: false };
}
