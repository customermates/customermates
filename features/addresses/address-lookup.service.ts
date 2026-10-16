import type { AddressLookupCache } from "./address-lookup-cache";
import type { AddressLookupMatch, AddressLookupProvider } from "./address-lookup-provider";
import type { AddressLookupRateLimiter } from "./address-lookup-rate-limiter";
import type { AddressCandidate, LookupAddressInput, VerifyAddressInput } from "./address-lookup.schema";
import type { RecordAddressParts } from "@/features/records/record-address-lines";

import { addressCandidateSigningSecret, encodeAddressCandidate } from "./address-candidate-token";
import { bestAddressMatch } from "./address-match";
import { cleanAddressPart } from "@/features/records/record-address-value";
import { formatRecordAddress } from "@/features/records/record-address";

export type AddressLookupCaller = {
  companyId: string;
  userId: string;
  locale: string;
  country: string | null;
};

type Searched =
  | { status: "off" }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "unavailable" }
  | { status: "ok"; attribution: string; matches: AddressLookupMatch[] };

export type AddressLookupOutcome =
  | Exclude<Searched, { status: "ok" }>
  | { status: "ok"; attribution: string; candidates: AddressCandidate[] };

function cacheQuery(query: string): string {
  return query.replace(/\s+/gu, " ").trim().toLowerCase();
}

function preferCountry(matches: AddressLookupMatch[], country: string | null): AddressLookupMatch[] {
  if (!country) return matches;
  return [
    ...matches.filter((match) => match.address.countryCode === country),
    ...matches.filter((match) => match.address.countryCode !== country),
  ];
}

export class AddressLookupService {
  constructor(
    private readonly provider: AddressLookupProvider | null,
    private readonly secret: string | undefined,
    private readonly limiter: AddressLookupRateLimiter,
    private readonly cache: AddressLookupCache,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get enabled(): boolean {
    return Boolean(this.provider && addressCandidateSigningSecret(this.secret));
  }

  private async search(
    caller: AddressLookupCaller,
    query: string,
    countryCode: string | null,
    limit: number,
  ): Promise<Searched> {
    const provider = this.provider;
    if (!provider || !this.enabled) return { status: "off" };
    const admission = this.limiter.admit(`${caller.companyId}:${caller.userId}`);
    if (!admission.allowed) return { status: "rate_limited", retryAfterSeconds: admission.retryAfterSeconds };
    const key = JSON.stringify([provider.id, cacheQuery(query), caller.locale, countryCode, limit]);
    const cached = this.cache.get(key);
    if (cached) return { status: "ok", attribution: provider.attribution, matches: cached };
    const outcome = await provider.search({ query, limit, locale: caller.locale, countryCode });
    if (!outcome.ok) return { status: "unavailable" };
    this.cache.set(key, outcome.matches);
    return { status: "ok", attribution: provider.attribution, matches: outcome.matches };
  }

  private sign(caller: AddressLookupCaller, matches: AddressLookupMatch[]): AddressCandidate[] {
    const secret = addressCandidateSigningSecret(this.secret);
    if (!secret) return [];
    const now = this.now();
    return matches.flatMap(({ name, address }) => {
      const candidateToken = encodeAddressCandidate(address, caller.companyId, secret, now);
      return candidateToken ? [{ candidateToken, name, address }] : [];
    });
  }

  async lookup(caller: AddressLookupCaller, input: LookupAddressInput): Promise<AddressLookupOutcome> {
    const countryCode = input.countryCode ?? null;
    const searched = await this.search(caller, input.query, countryCode, input.limit);
    if (searched.status !== "ok") return searched;
    const matches = countryCode ? searched.matches : preferCountry(searched.matches, caller.country);
    return { status: "ok", attribution: searched.attribution, candidates: this.sign(caller, matches) };
  }

  async verify(caller: AddressLookupCaller, input: VerifyAddressInput): Promise<AddressLookupOutcome> {
    const parts: RecordAddressParts = {
      street: cleanAddressPart(input.street, 200),
      line2: cleanAddressPart(input.line2, 200),
      postalCode: cleanAddressPart(input.postalCode, 20),
      city: cleanAddressPart(input.city, 200),
      region: cleanAddressPart(input.region, 200),
      countryCode: input.countryCode ?? null,
    };
    if (!this.provider || !this.enabled) return { status: "off" };
    if (!parts.postalCode && !parts.city)
      return { status: "ok", attribution: this.provider.attribution, candidates: [] };
    const query = formatRecordAddress({ ...parts, line2: null });
    const searched = await this.search(caller, query, parts.countryCode, 5);
    if (searched.status !== "ok") return searched;
    const match = bestAddressMatch(parts, searched.matches);
    if (!match) return { status: "ok", attribution: searched.attribution, candidates: [] };
    const address = { ...match.address, line2: parts.line2 };
    return {
      status: "ok",
      attribution: searched.attribution,
      candidates: this.sign(caller, [{ name: null, address: { ...address, formatted: formatRecordAddress(address) } }]),
    };
  }
}
