import { describe, expect, it, vi } from "vitest";

import type { AddressLookupMatch, AddressLookupOutcome, AddressLookupProvider } from "../address-lookup-provider";
import type { AddressLookupCaller } from "../address-lookup.service";
import type { RecordAddressParts } from "@/features/records/record-address-lines";

import { verifiedRecordAddress } from "@/features/records/record-address";
import { decodeAddressCandidate } from "../address-candidate-token";
import { AddressLookupCache } from "../address-lookup-cache";
import { AddressLookupRateLimiter } from "../address-lookup-rate-limiter";
import { AddressLookupService } from "../address-lookup.service";

const NOW = new Date("2026-10-15T08:00:00.000Z");
const SECRET = "lane-c-secret";
const SIGNING = `address-candidate:v1:${SECRET}`;
const CALLER: AddressLookupCaller = {
  companyId: "00000000-0000-4000-8000-0000000000c1",
  userId: "00000000-0000-4000-8000-0000000000a1",
  locale: "de",
  country: "de",
};

function match(parts: Partial<RecordAddressParts>, name: string | null = null): AddressLookupMatch {
  return {
    name,
    address: verifiedRecordAddress(
      { street: null, line2: null, postalCode: null, city: null, region: null, countryCode: null, ...parts },
      { provider: "photon", checkedAt: NOW.toISOString(), location: { lat: 49.48, lon: 8.47 } },
    ),
  };
}

const VIENNA = match({ street: "Hauptstraße 5", postalCode: "1140", city: "Wien", countryCode: "at" });
const MANNHEIM = match({ street: "Hauptstraße 5", postalCode: "68259", city: "Mannheim", countryCode: "de" }, "Café");

function service(outcomes: AddressLookupOutcome[], options: { secret?: string; provider?: boolean } = {}) {
  const search = vi.fn((query: Parameters<AddressLookupProvider["search"]>[0]) => {
    void query;
    return Promise.resolve(outcomes.shift() ?? { ok: false as const });
  });
  const provider: AddressLookupProvider = { id: "photon", attribution: "© OpenStreetMap contributors", search };
  const instance = new AddressLookupService(
    options.provider === false ? null : provider,
    "secret" in options ? options.secret : SECRET,
    new AddressLookupRateLimiter(2, 10_000, 100, () => NOW.getTime()),
    new AddressLookupCache(),
    () => NOW,
  );
  return { instance, search };
}

describe("address lookup service", () => {
  it("is off without a provider or without an auth secret, and then never calls out", async () => {
    for (const options of [{ provider: false }, { secret: "" }]) {
      const { instance, search } = service([], options);
      expect(instance.enabled).toBe(false);
      expect(await instance.lookup(CALLER, { query: "Hauptstraße 5", limit: 5 })).toEqual({ status: "off" });
      expect(await instance.verify(CALLER, { city: "Mannheim" })).toEqual({ status: "off" });
      expect(search).not.toHaveBeenCalled();
    }
  });

  it("signs every candidate for the caller's workspace and lists the caller's country first", async () => {
    const { instance, search } = service([{ ok: true, matches: [VIENNA, MANNHEIM] }]);
    const outcome = await instance.lookup(CALLER, { query: "Hauptstraße 5", limit: 5 });
    if (outcome.status !== "ok") throw new Error(outcome.status);
    expect(search).toHaveBeenCalledWith({ query: "Hauptstraße 5", limit: 5, locale: "de", countryCode: null });
    expect(outcome.attribution).toBe("© OpenStreetMap contributors");
    expect(outcome.candidates.map((candidate) => [candidate.name, candidate.address.city])).toEqual([
      ["Café", "Mannheim"],
      [null, "Wien"],
    ]);
    const [first] = outcome.candidates;
    expect(decodeAddressCandidate(first.candidateToken, CALLER.companyId, SIGNING, NOW)).toEqual(MANNHEIM.address);
    expect(
      decodeAddressCandidate(first.candidateToken, "00000000-0000-4000-8000-0000000000c2", SIGNING, NOW),
    ).toBeNull();
  });

  it("keeps the provider's order when a country is requested and caches identical lookups", async () => {
    const { instance, search } = service([{ ok: true, matches: [VIENNA] }]);
    const first = await instance.lookup(CALLER, { query: " Hauptstraße  5 ", limit: 3, countryCode: "at" });
    const second = await instance.lookup(CALLER, { query: "hauptstraße 5", limit: 3, countryCode: "at" });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ countryCode: "at", limit: 3 }));
    expect(first).toMatchObject({ status: "ok", candidates: [{ address: { city: "Wien" } }] });
    expect(second).toMatchObject({ status: "ok", candidates: [{ address: { city: "Wien" } }] });
  });

  it("limits each user and reports a failing provider without caching it", async () => {
    const { instance, search } = service([{ ok: false }, { ok: true, matches: [] }]);
    expect(await instance.lookup(CALLER, { query: "Main Street", limit: 5 })).toEqual({ status: "unavailable" });
    expect(await instance.lookup(CALLER, { query: "Main Street", limit: 5 })).toMatchObject({
      status: "ok",
      candidates: [],
    });
    expect(await instance.lookup(CALLER, { query: "Main Street", limit: 5 })).toEqual({
      status: "rate_limited",
      retryAfterSeconds: 5,
    });
    expect(await instance.lookup({ ...CALLER, userId: "other" }, { query: "Main Street", limit: 5 })).toMatchObject({
      status: "ok",
    });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("checks a typed address and returns the provider's version with the typed line2", async () => {
    const { instance, search } = service([{ ok: true, matches: [VIENNA, MANNHEIM] }]);
    const outcome = await instance.verify(CALLER, {
      street: "Hauptstr. 5",
      line2: "3. OG",
      postalCode: "68259",
      city: "Mannheim",
      countryCode: "de",
    });
    expect(search).toHaveBeenCalledWith({
      query: "Hauptstr. 5, 68259 Mannheim",
      limit: 5,
      locale: "de",
      countryCode: "de",
    });
    if (outcome.status !== "ok") throw new Error(outcome.status);
    expect(outcome.candidates).toHaveLength(1);
    const [suggestion] = outcome.candidates;
    expect(suggestion.name).toBeNull();
    expect(suggestion.address).toEqual({
      ...MANNHEIM.address,
      line2: "3. OG",
      formatted: "Hauptstraße 5, 3. OG, 68259 Mannheim",
    });
    expect(decodeAddressCandidate(suggestion.candidateToken, CALLER.companyId, SIGNING, NOW)).toEqual(
      suggestion.address,
    );
  });

  it("returns no suggestion when nothing matches or the input has neither postal code nor city", async () => {
    const { instance, search } = service([{ ok: true, matches: [MANNHEIM] }]);
    expect(await instance.verify(CALLER, { street: "Hauptstraße 9", postalCode: "68259" })).toMatchObject({
      status: "ok",
      candidates: [],
    });
    expect(await instance.verify(CALLER, { street: "Hauptstraße 9" })).toMatchObject({ status: "ok", candidates: [] });
    expect(search).toHaveBeenCalledTimes(1);
  });
});
