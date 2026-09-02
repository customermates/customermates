import { PUBLIC_AD_ATTRIBUTION_PENDING_PARAM } from "@/features/acquisition/ad-attribution.schema";
import { AD_IDENTIFIER_KINDS } from "@/features/acquisition/ad-provider-registry";

function scrubbedParams(): string[] {
  return [...AD_IDENTIFIER_KINDS, PUBLIC_AD_ATTRIBUTION_PENDING_PARAM];
}

export function scrubAdIdentifiersFromUrl(url: string): string {
  const separator = url.indexOf("?");
  if (separator === -1) return url;

  const base = url.slice(0, separator);
  const [query, fragment] = url.slice(separator + 1).split("#", 2);
  const params = new URLSearchParams(query);

  let removed = false;
  for (const param of scrubbedParams()) {
    if (!params.has(param)) continue;
    params.delete(param);
    removed = true;
  }
  if (!removed) return url;

  const search = params.toString();
  return `${base}${search ? `?${search}` : ""}${fragment === undefined ? "" : `#${fragment}`}`;
}

export function scrubAdIdentifiersFromEvent<T extends { request?: { url?: string } }>(event: T): T {
  if (event.request?.url) event.request.url = scrubAdIdentifiersFromUrl(event.request.url);
  return event;
}
