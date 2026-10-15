import { describe, expect, it } from "vitest";

import type { ProviderJsonResult } from "../address-lookup-request";

import { PhotonAddressLookupProvider } from "../photon-address-lookup.provider";

const NOW = new Date("2026-10-15T08:00:00.000Z");

function house(street: string, countrycode: string) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [8.47, 49.48] },
    properties: { type: "house", street, housenumber: "1", city: "Town", postcode: "12345", countrycode },
  };
}

function provider(baseUrl: string, responses: ProviderJsonResult[]) {
  const urls: URL[] = [];
  const instance = new PhotonAddressLookupProvider(
    baseUrl,
    (url) => {
      urls.push(url);
      return Promise.resolve(responses.shift() ?? { ok: false, reason: "unavailable" });
    },
    () => NOW,
  );
  return { instance, urls };
}

describe("Photon address lookup provider", () => {
  it("asks the configured Photon API in the caller's language and country", async () => {
    const { instance, urls } = provider("https://photon.example.test/geo", [
      { ok: true, body: { features: [house("Hauptstraße", "DE")] } },
    ]);
    const outcome = await instance.search({ query: "Hauptstraße 1", limit: 5, locale: "de", countryCode: "de" });
    expect(outcome).toMatchObject({ ok: true, matches: [{ address: { street: "Hauptstraße 1", countryCode: "de" } }] });
    expect(urls.map(String)).toEqual([
      "https://photon.example.test/geo/api?q=Hauptstra%C3%9Fe+1&limit=10&lang=de&countrycode=DE",
    ]);
  });

  it("accepts a configured URL that already ends in /api and caps the fetched results", async () => {
    const { instance, urls } = provider("http://photon:2322/api/", [{ ok: true, body: { features: [] } }]);
    await instance.search({ query: "Main Street", limit: 10, locale: "en", countryCode: null });
    expect(String(urls[0])).toBe("http://photon:2322/api?q=Main+Street&limit=15&lang=en");
  });

  it("keeps parameters of the configured URL, such as a proxy key, but sets the search parameters itself", async () => {
    const { instance, urls } = provider("https://geo.example.test/photon/api?key=abc&lang=fr&q=ignored#top", [
      { ok: true, body: { features: [] } },
    ]);
    await instance.search({ query: "Main Street", limit: 5, locale: "en", countryCode: null });
    expect(String(urls[0])).toBe("https://geo.example.test/photon/api?key=abc&lang=en&q=Main+Street&limit=10");
  });

  it("retries an older Photon that rejects a parameter with its compatible defaults and filters locally", async () => {
    const { instance, urls } = provider("https://photon.example.test", [
      { ok: false, reason: "status", status: 400 },
      { ok: true, body: { features: [house("Via Roma", "IT"), house("Hauptstraße", "DE"), house("Via Po", "IT")] } },
    ]);
    const outcome = await instance.search({ query: "Via Roma", limit: 1, locale: "it", countryCode: "it" });
    expect(urls.map((url) => url.searchParams.get("lang"))).toEqual(["it", "default"]);
    expect(urls.map((url) => url.searchParams.get("countrycode"))).toEqual(["IT", null]);
    expect(outcome).toMatchObject({ ok: true, matches: [{ address: { street: "Via Roma 1", countryCode: "it" } }] });
    expect(outcome.ok && outcome.matches).toHaveLength(1);
  });

  it("reports an unavailable provider for failures and bodies that are not Photon results", async () => {
    expect(
      await provider("https://photon.example.test", [{ ok: false, reason: "timeout" }]).instance.search({
        query: "Main Street",
        limit: 5,
        locale: "en",
        countryCode: null,
      }),
    ).toEqual({ ok: false });
    expect(
      await provider("https://photon.example.test", [{ ok: true, body: { error: "nope" } }]).instance.search({
        query: "Main Street",
        limit: 5,
        locale: "en",
        countryCode: null,
      }),
    ).toEqual({ ok: false });
  });
});
