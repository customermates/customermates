export function localDemoBaseUrl(): string | null {
  if (process.env.NODE_ENV !== "development") return null;

  const base = process.env.DEMO_PREVIEW_URL || process.env.BASE_URL;

  return base ? base.replace(/\/$/u, "") : null;
}

export function localProductDemoSrc(src: string): string {
  const base = localDemoBaseUrl();
  if (!base) return src;

  const url = new URL(src);
  if (url.hostname !== "demo.customermates.com") return src;

  return `${base}${url.pathname}${url.search}${url.hash}`;
}
