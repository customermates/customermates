import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AddressCandidate } from "@/features/addresses/address-lookup.schema";

vi.mock("@/app/[locale]/(protected)/records/actions", () => ({
  lookupAddressAction: vi.fn(),
  verifyAddressAction: vi.fn(),
}));

import { addressCheckKey, RecordAddressLookupStore } from "../record-address-lookup.store";

const PARTS = {
  street: "Hauptstr. 5",
  line2: null,
  postalCode: "68259",
  city: "Mannheim",
  region: null,
  countryCode: "de",
};

const CANDIDATE: AddressCandidate = {
  candidateToken: "token-1",
  name: null,
  address: {
    street: "Hauptstraße 5",
    line2: null,
    postalCode: "68259",
    city: "Mannheim",
    region: "Baden-Württemberg",
    countryCode: "de",
    formatted: "Hauptstraße 5, 68259 Mannheim",
    location: { lat: 49.4857901, lon: 8.5370071 },
    verification: { status: "verified", provider: "photon", checkedAt: "2026-10-15T08:00:00.000Z" },
  },
};

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function store() {
  const lookup = vi.fn();
  const verify = vi.fn();
  return { lookup, verify, instance: new RecordAddressLookupStore({ lookup, verify }) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("address search store", () => {
  it("waits for three characters and 250 ms before it searches", async () => {
    const { lookup, instance } = store();
    lookup.mockResolvedValue({
      ok: true,
      data: { available: true, attribution: "© OpenStreetMap contributors", candidates: [CANDIDATE] },
    });
    instance.setQuery("Ha");
    expect(instance.status).toBe("idle");
    instance.setQuery("Hau");
    instance.setQuery("Haupt");
    expect(instance.status).toBe("searching");
    await vi.advanceTimersByTimeAsync(249);
    expect(lookup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(lookup).toHaveBeenCalledExactlyOnceWith({ query: "Haupt", limit: 5 });
    expect(instance.status).toBe("ready");
    expect(instance.candidates).toEqual([CANDIDATE]);
    expect(instance.attribution).toBe("© OpenStreetMap contributors");
  });

  it("ignores an answer for a query the user already changed", async () => {
    const { lookup, instance } = store();
    const slow = deferred<unknown>();
    lookup.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({
      ok: true,
      data: { available: true, attribution: "© OpenStreetMap contributors", candidates: [] },
    });
    instance.setQuery("Hauptstraße");
    await vi.advanceTimersByTimeAsync(250);
    instance.setQuery("Hauptstraße 5");
    await vi.advanceTimersByTimeAsync(250);
    slow.resolve({ ok: true, data: { available: true, attribution: null, candidates: [CANDIDATE] } });
    await vi.runAllTimersAsync();
    expect(instance.candidates).toEqual([]);
    expect(instance.status).toBe("ready");
  });

  it("shows the failure code and can retry", async () => {
    const { lookup, instance } = store();
    lookup
      .mockResolvedValueOnce({ ok: false, error: {}, code: "addressLookupRateLimited" })
      .mockRejectedValueOnce(new Error("offline"));
    instance.setQuery("Hauptstraße");
    await vi.advanceTimersByTimeAsync(250);
    expect(instance.status).toBe("failed");
    expect(instance.failure).toBe("addressLookupRateLimited");
    await instance.retry();
    await vi.advanceTimersByTimeAsync(250);
    expect(instance.status).toBe("failed");
    expect(instance.failure).toBeNull();
    instance.reset();
    expect(instance.query).toBe("");
    expect(instance.status).toBe("idle");
  });
});

describe("address check store", () => {
  it("keeps the suggestion for the parts it checked", async () => {
    const { verify, instance } = store();
    verify.mockResolvedValue({
      ok: true,
      data: { available: true, attribution: "© OpenStreetMap contributors", match: CANDIDATE },
    });
    await instance.checkAddress(PARTS);
    expect(verify).toHaveBeenCalledExactlyOnceWith(PARTS);
    expect(instance.check).toEqual({ status: "match", key: addressCheckKey(PARTS), match: CANDIDATE });
    instance.dismissCheck();
    expect(instance.check).toEqual({ status: "idle" });
  });

  it("reports no match, failures and drops an answer after a dismiss", async () => {
    const { verify, instance } = store();
    verify.mockResolvedValueOnce({ ok: true, data: { available: true, attribution: null, match: null } });
    await instance.checkAddress(PARTS);
    expect(instance.check).toEqual({ status: "noMatch", key: addressCheckKey(PARTS) });
    verify.mockResolvedValueOnce({ ok: false, error: {}, code: "addressLookupUnavailable" });
    await instance.checkAddress(PARTS);
    expect(instance.check).toEqual({ status: "failed", key: addressCheckKey(PARTS), code: "addressLookupUnavailable" });
    const slow = deferred<unknown>();
    verify.mockReturnValueOnce(slow.promise);
    const pending = instance.checkAddress(PARTS);
    instance.dismissCheck();
    slow.resolve({ ok: true, data: { available: true, attribution: null, match: CANDIDATE } });
    await pending;
    expect(instance.check).toEqual({ status: "idle" });
  });
});
