export function localProductDemoSrc(src: string): string {
  if (process.env.NODE_ENV !== "development" || !process.env.BASE_URL) return src;

  const url = new URL(src);
  if (url.hostname !== "demo.customermates.com") return src;

  return `${process.env.BASE_URL.replace(/\/$/u, "")}${url.pathname}${url.search}${url.hash}`;
}
