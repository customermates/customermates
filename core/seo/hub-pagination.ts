export const HUB_PAGE_SIZE = 24;

export const HUB_PAGE_PARAM = "page";

export type HubSearchParams = Record<string, string | string[] | undefined>;

export type HubPage<T> = {
  items: T[];
  page: number;
  pageCount: number;
};

export type HubPageResolution =
  | { kind: "page"; page: number }
  | { kind: "redirect-page-one"; page: 1 }
  | { kind: "not-found" };

export type HubPagerModel = {
  nextPage: number | null;
  pageNumbers: number[];
  previousPage: number | null;
};

type SourcePage = {
  url: string;
};

export type SluggedPage<T extends SourcePage> = {
  page: T;
  slug: string;
};

export function hubPageCount(total: number, size: number = HUB_PAGE_SIZE): number {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError("Hub item total must be a non-negative integer");
  if (!Number.isSafeInteger(size) || size < 1) throw new RangeError("Hub page size must be a positive integer");

  return Math.max(1, Math.ceil(total / size));
}

export function resolveHubPage(raw: string | string[] | undefined, pageCount: number): HubPageResolution {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new RangeError("Hub page count must be positive");
  if (raw === undefined) return { kind: "page", page: 1 };
  if (Array.isArray(raw) || !/^[1-9]\d*$/u.test(raw)) return { kind: "not-found" };

  const page = Number(raw);
  if (!Number.isSafeInteger(page) || page > pageCount) return { kind: "not-found" };
  if (page === 1) return { kind: "redirect-page-one", page: 1 };

  return { kind: "page", page };
}

export function hubPageHref(basePath: string, page: number): string {
  if (!Number.isSafeInteger(page) || page < 1) throw new RangeError("Hub page must be a positive integer");
  return page === 1 ? basePath : `${basePath}?${HUB_PAGE_PARAM}=${page}`;
}

export function hubPageOneRedirectHref(basePath: string, searchParams: HubSearchParams): string {
  const preserved = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === HUB_PAGE_PARAM || value === undefined) continue;
    if (Array.isArray(value)) for (const entry of value) preserved.append(key, entry);
    else preserved.append(key, value);
  }

  const query = preserved.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function paginateHub<T>(items: readonly T[], page: number, size: number = HUB_PAGE_SIZE): HubPage<T> {
  const pageCount = hubPageCount(items.length, size);
  if (!Number.isSafeInteger(page) || page < 1 || page > pageCount)
    throw new RangeError(`Hub page ${page} is outside 1-${pageCount}`);

  const start = (page - 1) * size;
  return { items: items.slice(start, start + size), page, pageCount };
}

export function hubPagerModel(page: number, pageCount: number): HubPagerModel {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new RangeError("Hub page count must be positive");
  if (!Number.isSafeInteger(page) || page < 1 || page > pageCount)
    throw new RangeError(`Hub page ${page} is outside 1-${pageCount}`);

  const bucketSize = Math.ceil(Math.sqrt(pageCount));
  const currentBucketStart = Math.floor((page - 1) / bucketSize) * bucketSize + 1;
  const numbers = new Set<number>();

  for (let bucketStart = 1; bucketStart <= pageCount; bucketStart += bucketSize) numbers.add(bucketStart);
  for (
    let bucketPage = currentBucketStart;
    bucketPage <= Math.min(currentBucketStart + bucketSize - 1, pageCount);
    bucketPage++
  )
    numbers.add(bucketPage);

  return {
    nextPage: page < pageCount ? page + 1 : null,
    pageNumbers: [...numbers].sort((a, b) => a - b),
    previousPage: page > 1 ? page - 1 : null,
  };
}

export function paginateLocalizedHubPages<ReferencePage extends SourcePage, LocalizedPage extends SourcePage>(
  referencePages: readonly ReferencePage[],
  localizedPages: readonly LocalizedPage[],
  page: number,
  compareReference: (a: SluggedPage<ReferencePage>, b: SluggedPage<ReferencePage>) => number,
): HubPage<SluggedPage<LocalizedPage>> {
  const references = indexPages(referencePages, "reference").sort((a, b) => {
    const compared = compareReference(a, b);
    if (compared !== 0) return compared;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  const localized = new Map(indexPages(localizedPages, "localized").map((entry) => [entry.slug, entry.page]));
  const paginated = paginateHub(references, page);

  return {
    ...paginated,
    items: paginated.items.map(({ slug }) => {
      const localizedPage = localized.get(slug);
      if (!localizedPage) throw new Error(`Localized hub content is missing slug ${slug}`);
      return { page: localizedPage, slug };
    }),
  };
}

function indexPages<T extends SourcePage>(pages: readonly T[], label: string): SluggedPage<T>[] {
  const seen = new Set<string>();

  return pages.map((page) => {
    const slug = page.url.split("/").filter(Boolean).pop() ?? "";
    if (!slug) throw new Error(`${label} hub content has a page without a slug`);
    if (seen.has(slug)) throw new Error(`${label} hub content repeats slug ${slug}`);
    seen.add(slug);
    return { page, slug };
  });
}
