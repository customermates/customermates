import type { AddressLookupOutcome, AddressLookupProvider, AddressLookupQuery } from "./address-lookup-provider";
import type { ProviderJsonResult } from "./address-lookup-request";

import { requestProviderJson } from "./address-lookup-request";
import { PHOTON_PROVIDER_ID, photonMatches } from "./photon-address-mapping";

export const ADDRESS_LOOKUP_USER_AGENT =
  "Customermates/1.0 (+https://customermates.com/docs/app-records; address lookup)";
export const OPENSTREETMAP_ATTRIBUTION = "© OpenStreetMap contributors";

const MAX_FETCHED_RESULTS = 15;

function requestPhoton(url: URL): Promise<ProviderJsonResult> {
  return requestProviderJson(url, { timeoutMs: 2_000, maxBytes: 262_144, userAgent: ADDRESS_LOOKUP_USER_AGENT });
}

export class PhotonAddressLookupProvider implements AddressLookupProvider {
  readonly id = PHOTON_PROVIDER_ID;
  readonly attribution = OPENSTREETMAP_ATTRIBUTION;

  constructor(
    private readonly baseUrl: string,
    private readonly request: (url: URL) => Promise<ProviderJsonResult> = requestPhoton,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private endpoint(query: AddressLookupQuery, compatible: boolean): URL {
    const url = new URL(this.baseUrl);
    const path = url.pathname.replace(/\/+$/u, "");
    url.pathname = path.endsWith("/api") ? path : `${path}/api`;
    url.hash = "";
    url.searchParams.set("q", query.query);
    url.searchParams.set("limit", String(Math.min(query.limit + 5, MAX_FETCHED_RESULTS)));
    url.searchParams.set("lang", compatible ? "default" : query.locale);
    if (!compatible && query.countryCode) url.searchParams.set("countrycode", query.countryCode.toUpperCase());
    return url;
  }

  async search(query: AddressLookupQuery): Promise<AddressLookupOutcome> {
    let result = await this.request(this.endpoint(query, false));
    if (!result.ok && result.reason === "status" && result.status === 400)
      result = await this.request(this.endpoint(query, true));
    if (!result.ok) return { ok: false };
    const matches = photonMatches(result.body, this.now().toISOString());
    if (!matches) return { ok: false };
    return {
      ok: true,
      matches: matches
        .filter((match) => !query.countryCode || match.address.countryCode === query.countryCode)
        .slice(0, query.limit),
    };
  }
}
