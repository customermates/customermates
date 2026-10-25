import { describe, expect, it } from "vitest";

import type { AddressLookupMatch } from "../address-lookup-provider";

import { AddressLookupCache } from "../address-lookup-cache";
import { AddressLookupRateLimiter } from "../address-lookup-rate-limiter";

function clock() {
  const state = { now: 1_000_000 };
  return { state, now: () => state.now };
}

describe("address lookup rate limiter", () => {
  it("admits 30 requests per user in 10 seconds and says when to retry", () => {
    const time = clock();
    const limiter = new AddressLookupRateLimiter(30, 10_000, 100, time.now);
    for (let index = 0; index < 30; index++) expect(limiter.admit("company:user")).toEqual({ allowed: true });
    expect(limiter.admit("company:user")).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.admit("company:other")).toEqual({ allowed: true });
    time.state.now += 1_000;
    for (let index = 0; index < 3; index++) expect(limiter.admit("company:user")).toEqual({ allowed: true });
    expect(limiter.admit("company:user").allowed).toBe(false);
    time.state.now += 10_000;
    for (let index = 0; index < 30; index++) expect(limiter.admit("company:user")).toEqual({ allowed: true });
  });

  it("forgets the least recently used users beyond its key budget", () => {
    const time = clock();
    const limiter = new AddressLookupRateLimiter(1, 10_000, 2, time.now);
    expect(limiter.admit("a").allowed).toBe(true);
    expect(limiter.admit("b").allowed).toBe(true);
    expect(limiter.admit("c").allowed).toBe(true);
    expect(limiter.admit("a").allowed).toBe(true);
    expect(limiter.admit("c").allowed).toBe(false);
  });
});

describe("address lookup cache", () => {
  const matches: AddressLookupMatch[] = [];

  it("returns entries for 10 minutes", () => {
    const time = clock();
    const cache = new AddressLookupCache(600_000, 10, time.now);
    cache.set("q", matches);
    time.state.now += 599_999;
    expect(cache.get("q")).toBe(matches);
    time.state.now += 1;
    expect(cache.get("q")).toBeNull();
  });

  it("evicts the least recently used entry beyond its size", () => {
    const time = clock();
    const cache = new AddressLookupCache(600_000, 2, time.now);
    cache.set("a", matches);
    cache.set("b", matches);
    expect(cache.get("a")).toBe(matches);
    cache.set("c", matches);
    expect(cache.get("b")).toBeNull();
    expect(cache.get("a")).toBe(matches);
    expect(cache.get("c")).toBe(matches);
  });
});
