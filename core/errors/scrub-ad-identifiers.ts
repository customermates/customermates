import { PUBLIC_AD_ATTRIBUTION_PENDING_PARAM } from "@/features/acquisition/ad-attribution.schema";
import { AD_IDENTIFIER_KINDS } from "@/features/acquisition/ad-provider-registry";

type QueryString = string | Record<string, string> | [string, string][];

type ScrubbableBreadcrumb = { data?: Record<string, unknown> };

type ScrubbableEvent = {
  request?: {
    url?: string;
    query_string?: QueryString;
    headers?: Record<string, string>;
  };
  breadcrumbs?: ScrubbableBreadcrumb[];
};

const REFERER_HEADERS = ["Referer", "referer", "Referrer", "referrer"];

const BREADCRUMB_URL_FIELDS = ["from", "to", "url"];

function scrubbedParams(): string[] {
  return [...AD_IDENTIFIER_KINDS, PUBLIC_AD_ATTRIBUTION_PENDING_PARAM];
}

function deleteScrubbedParams(params: URLSearchParams): boolean {
  let removed = false;
  for (const param of scrubbedParams()) {
    if (!params.has(param)) continue;
    params.delete(param);
    removed = true;
  }
  return removed;
}

export function scrubAdIdentifiersFromQueryString(query: string): string {
  const params = new URLSearchParams(query);
  if (!deleteScrubbedParams(params)) return query;
  return params.toString();
}

export function scrubAdIdentifiersFromUrl(url: string): string {
  const separator = url.indexOf("?");
  if (separator === -1) return url;

  const base = url.slice(0, separator);
  const [query, fragment] = url.slice(separator + 1).split("#", 2);
  const params = new URLSearchParams(query);
  if (!deleteScrubbedParams(params)) return url;

  const search = params.toString();
  return `${base}${search ? `?${search}` : ""}${fragment === undefined ? "" : `#${fragment}`}`;
}

function scrubQueryStringField(value: QueryString): QueryString {
  if (typeof value === "string") return scrubAdIdentifiersFromQueryString(value);

  const removed = new Set(scrubbedParams());
  if (Array.isArray(value)) return value.filter(([key]) => !removed.has(key));

  return Object.fromEntries(Object.entries(value).filter(([key]) => !removed.has(key)));
}

export function scrubAdIdentifiersFromEvent<T extends ScrubbableEvent>(event: T): T {
  const request = event.request;
  if (request?.url) request.url = scrubAdIdentifiersFromUrl(request.url);
  if (request?.query_string !== undefined) request.query_string = scrubQueryStringField(request.query_string);

  if (request?.headers) {
    for (const header of REFERER_HEADERS) {
      const value = request.headers[header];
      if (typeof value === "string") request.headers[header] = scrubAdIdentifiersFromUrl(value);
    }
  }

  if (event.breadcrumbs) {
    for (const breadcrumb of event.breadcrumbs) {
      const data = breadcrumb.data;
      if (!data) continue;
      for (const field of BREADCRUMB_URL_FIELDS) {
        const value = data[field];
        if (typeof value === "string") data[field] = scrubAdIdentifiersFromUrl(value);
      }
    }
  }

  return event;
}
