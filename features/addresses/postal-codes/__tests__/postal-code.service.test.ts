import { describe, expect, it } from "vitest";

import type { ProviderFileResult } from "../../address-lookup-request";
import type { PostalCodeRow } from "../geonames-postal-codes";
import type { PostalCodeCountryState, PostalCodeSourceRecord } from "../postal-code.repo";

import { transactionStorage } from "@/core/decorators/transaction-context";
import { addressFormatOf } from "../../address-metadata";
import { PostalCodeCache } from "../postal-code-cache";
import { PostalCodeRepo } from "../postal-code.repo";
import { PostalCodeService, postalCodeLoadDue } from "../postal-code.service";
import { geonamesLine, zipFixture } from "./zip-fixture";

const NOW = new Date("2026-10-16T10:00:00.000Z");
const BASE_URL = "https://postal.example";
const VERSION = "1:2026-10-16";

class MemoryPostalCodeRepo extends PostalCodeRepo {
  states = new Map<string, PostalCodeCountryState>();
  rows = new Map<string, PostalCodeRow[]>();
  sources = new Map<string, readonly PostalCodeSourceRecord[]>();
  claims: string[] = [];
  stateReads = 0;

  country(countryCode: string) {
    this.stateReads += 1;
    return Promise.resolve(this.states.get(countryCode) ?? null);
  }

  claim(countryCode: string, version: string, previous: PostalCodeCountryState | null, now: Date) {
    const current = this.states.get(countryCode) ?? null;
    if ((current?.attemptedAt.getTime() ?? null) !== (previous?.attemptedAt.getTime() ?? null))
      return Promise.resolve(false);
    this.claims.push(countryCode);
    this.states.set(countryCode, {
      countryCode,
      status: current?.status === "ready" ? "ready" : "loading",
      version: current?.version ?? version,
      rowCount: current?.rowCount ?? 0,
      loadedAt: current?.loadedAt ?? null,
      attemptedAt: now,
      attempts: (current?.attempts ?? 0) + 1,
      failure: null,
    });
    return Promise.resolve(true);
  }

  replace(
    countryCode: string,
    version: string,
    rows: readonly PostalCodeRow[],
    sources: readonly PostalCodeSourceRecord[],
    now: Date,
  ) {
    this.rows.set(countryCode, [...rows]);
    this.sources.set(countryCode, sources);
    this.states.set(countryCode, {
      countryCode,
      status: "ready",
      version,
      rowCount: rows.length,
      loadedAt: now,
      attemptedAt: now,
      attempts: 0,
      failure: null,
    });
    return Promise.resolve();
  }

  fail(countryCode: string, status: "failed" | "unavailable", failure: string, now: Date) {
    const current = this.states.get(countryCode);
    this.states.set(countryCode, {
      countryCode,
      status: current?.status === "ready" ? "ready" : status,
      version: current?.version ?? "",
      rowCount: current?.rowCount ?? 0,
      loadedAt: current?.loadedAt ?? null,
      attemptedAt: current?.attemptedAt ?? now,
      attempts: current?.attempts ?? 1,
      failure,
    });
    return Promise.resolve();
  }

  places(countryCode: string, keys: readonly string[]) {
    return Promise.resolve((this.rows.get(countryCode) ?? []).filter((row) => keys.includes(row.postalKey)));
  }
}

function file(body: Buffer): ProviderFileResult {
  return { ok: true, body, modifiedAt: "2026-10-16T02:14:44.000Z" };
}

function setup(files: Record<string, ProviderFileResult>, baseUrl: string | null = BASE_URL) {
  const repo = new MemoryPostalCodeRepo();
  const dispatched: string[] = [];
  const downloads: string[] = [];
  const service = new PostalCodeService(
    repo,
    new PostalCodeCache(),
    baseUrl,
    VERSION,
    addressFormatOf,
    (countryCode) => {
      dispatched.push(countryCode);
      return Promise.resolve();
    },
    (url) => {
      downloads.push(url.pathname.slice(1));
      return Promise.resolve(files[url.pathname.slice(1)] ?? { ok: false, reason: "status", status: 404 });
    },
    () => NOW,
  );
  return { repo, service, dispatched, downloads };
}

const GERMAN_FILE = zipFixture([
  {
    name: "DE.txt",
    content: [
      geonamesLine("DE", "68259", "Mannheim", { name3: "Mannheim" }, 49.4903, 8.5339),
      geonamesLine("DE", "01945", "Ruhland", { name3: "Landkreis Oberspreewald-Lausitz" }, 51.4576, 13.8664),
      geonamesLine("DE", "01945", "Tettau", { name3: "Landkreis Oberspreewald-Lausitz" }, 51.4333, 13.7333),
    ].join("\n"),
  },
]);

function state(values: Partial<PostalCodeCountryState>): PostalCodeCountryState {
  return {
    countryCode: "de",
    status: "ready",
    version: VERSION,
    rowCount: 3,
    loadedAt: NOW,
    attemptedAt: NOW,
    attempts: 0,
    failure: null,
    ...values,
  };
}

describe("postal code service", () => {
  it("starts loading a country on its first lookup and answers pending meanwhile", async () => {
    const { repo, service, dispatched } = setup({});
    expect(await service.lookup("de", "68259")).toEqual({ status: "pending" });
    expect(repo.claims).toEqual(["de"]);
    expect(dispatched).toEqual(["de"]);
    expect(await service.lookup("de", "68259")).toEqual({ status: "pending" });
    expect(dispatched).toEqual(["de"]);
  });

  it("notices within seconds that another instance finished loading a country", async () => {
    let clock = 0;
    const repo = new MemoryPostalCodeRepo();
    const instance = (cache: PostalCodeCache) =>
      new PostalCodeService(
        repo,
        cache,
        BASE_URL,
        VERSION,
        addressFormatOf,
        () => Promise.resolve(),
        () => Promise.resolve(file(GERMAN_FILE)),
        () => NOW,
      );
    const web = instance(new PostalCodeCache(60_000, 600_000, 2_000, () => clock));
    expect(await web.lookup("de", "68259")).toEqual({ status: "pending" });
    expect(await web.lookup("de", "68259")).toEqual({ status: "pending" });
    expect(await instance(new PostalCodeCache()).load("de")).toEqual({ status: "ready", rows: 3 });
    expect(await web.lookup("de", "68259")).toEqual({ status: "pending" });
    clock += 3_001;
    expect(await web.lookup("de", "68259")).toMatchObject({ status: "ready", match: "exact", postalCode: "68259" });
    const reads = repo.stateReads;
    clock += 30_000;
    await web.lookup("de", "68259");
    expect(repo.stateReads).toBe(reads);
  });

  it("answers unavailable without loading when postal code data is switched off", async () => {
    const { repo, service, dispatched } = setup({}, null);
    expect(await service.lookup("de", "68259")).toEqual({ status: "unavailable" });
    expect(repo.claims).toEqual([]);
    expect(dispatched).toEqual([]);
  });

  it("waits for the commit before claiming a load from inside a transaction", async () => {
    const { repo, service } = setup({});
    const afterCommit: Array<() => Promise<void>> = [];
    await transactionStorage.run({ client: {} as never, afterCommit, eventWakeups: new Set() }, async () =>
      expect(await service.lookup("de", "68259")).toEqual({ status: "pending" }),
    );
    expect(repo.claims).toEqual([]);
    await Promise.all(afterCommit.map((run) => run()));
    expect(repo.claims).toEqual(["de"]);
  });

  it("loads a country file, keeps its source checksum and serves its places", async () => {
    const { repo, service, downloads } = setup({ "DE.zip": file(GERMAN_FILE) });
    expect(await service.load("de")).toEqual({ status: "ready", rows: 3 });
    expect(downloads).toEqual(["DE.zip"]);
    expect(repo.sources.get("de")).toEqual([
      {
        file: "DE.zip",
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        bytes: GERMAN_FILE.length,
        modifiedAt: "2026-10-16T02:14:44.000Z",
      },
    ]);
    expect(await service.lookup("de", "01945")).toEqual({
      status: "ready",
      match: "exact",
      cityChecked: true,
      postalCode: "01945",
      places: [
        { city: "Ruhland", region: null, latitude: 51.4576, longitude: 13.8664 },
        { city: "Tettau", region: null, latitude: 51.4333, longitude: 13.7333 },
      ],
    });
    expect(await service.lookup("de", "99999")).toEqual({
      status: "ready",
      match: "none",
      cityChecked: true,
      postalCode: null,
      places: [],
    });
  });

  it("finds an area code from a full code where the data only lists areas", async () => {
    const { service } = setup({
      "GB.zip": file(
        zipFixture([
          {
            name: "GB.txt",
            content: geonamesLine("GB", "SW1A", "Westminster", { name2: "Greater London" }, 51.5, -0.13),
          },
        ]),
      ),
    });
    await service.load("gb");
    expect(await service.lookup("gb", "SW1A 1AA")).toMatchObject({
      status: "ready",
      match: "exact",
      cityChecked: false,
      postalCode: "SW1A",
      places: [{ city: "London" }],
    });
  });

  it("offers a rounded code's places as an approximate area", async () => {
    const { service } = setup({
      "CL.zip": file(
        zipFixture([{ name: "CL.txt", content: geonamesLine("CL", "8340000", "Santiago", {}, -33.45, -70.66) }]),
      ),
    });
    await service.load("cl");
    expect(await service.lookup("cl", "8340518")).toMatchObject({
      status: "ready",
      match: "area",
      postalCode: "8340000",
      places: [{ city: "Santiago" }],
    });
  });

  it("marks a country without a file unavailable and a failed download failed", async () => {
    const missing = setup({});
    expect(await missing.service.load("zz")).toEqual({ status: "unavailable", reason: "status 404" });
    expect(missing.repo.states.get("zz")?.status).toBe("unavailable");
    const broken = setup({ "DE.zip": { ok: false, reason: "timeout" } });
    expect(await broken.service.load("de")).toEqual({ status: "failed", reason: "timeout" });
  });

  it("skips a territory file that is missing and keeps the country's own data", async () => {
    const { service, downloads } = setup({
      "US.zip": file(
        zipFixture([
          { name: "US.txt", content: geonamesLine("US", "95014", "Cupertino", { name1: "California", code1: "CA" }) },
        ]),
      ),
      "PR.zip": file(zipFixture([{ name: "PR.txt", content: geonamesLine("PR", "00601", "Adjuntas") }])),
    });
    expect(await service.load("us")).toEqual({ status: "ready", rows: 2 });
    expect(downloads).toEqual([
      "US.zip",
      "PR.zip",
      "GU.zip",
      "VI.zip",
      "AS.zip",
      "MP.zip",
      "MH.zip",
      "FM.zip",
      "PW.zip",
    ]);
    expect(await service.lookup("us", "00601")).toMatchObject({ places: [{ city: "Adjuntas", region: "PR" }] });
  });

  it("refuses data that is damaged, mostly in another format or far smaller than before", async () => {
    const damaged = setup({ "DE.zip": file(Buffer.from("<html>maintenance</html>")) });
    expect(await damaged.service.load("de")).toMatchObject({ status: "failed" });
    const foreign = setup({
      "DE.zip": file(
        zipFixture([
          { name: "DE.txt", content: [geonamesLine("DE", "1234", "A"), geonamesLine("DE", "AB12", "B")].join("\n") },
        ]),
      ),
    });
    expect(await foreign.service.load("de")).toEqual({
      status: "failed",
      reason: "only 0% of the postal codes match the country's format",
    });
    const shrunk = setup({ "DE.zip": file(GERMAN_FILE) });
    shrunk.repo.states.set("de", state({ rowCount: 100 }));
    expect(await shrunk.service.load("de")).toEqual({
      status: "failed",
      reason: "the new data has 3 rows instead of 100",
    });
    expect(shrunk.repo.states.get("de")).toMatchObject({ status: "ready", rowCount: 100 });
  });

  it("reloads stale, outdated or failed data on a schedule", () => {
    const later = (ms: number) => new Date(NOW.getTime() + ms);
    const hour = 3_600_000;
    expect(postalCodeLoadDue(null, VERSION, NOW)).toBe(true);
    expect(postalCodeLoadDue(state({}), VERSION, later(2 * hour))).toBe(false);
    expect(postalCodeLoadDue(state({ version: "0:old" }), VERSION, later(2 * hour))).toBe(true);
    expect(postalCodeLoadDue(state({ version: "0:old" }), VERSION, later(hour / 2))).toBe(false);
    expect(postalCodeLoadDue(state({}), VERSION, later(91 * 24 * hour))).toBe(true);
    expect(postalCodeLoadDue(state({ status: "loading" }), VERSION, later(10 * 60_000))).toBe(false);
    expect(postalCodeLoadDue(state({ status: "loading" }), VERSION, later(20 * 60_000))).toBe(true);
    expect(postalCodeLoadDue(state({ status: "failed", attempts: 3 }), VERSION, later(3 * hour))).toBe(false);
    expect(postalCodeLoadDue(state({ status: "failed", attempts: 3 }), VERSION, later(5 * hour))).toBe(true);
    expect(postalCodeLoadDue(state({ status: "unavailable" }), VERSION, later(29 * 24 * hour))).toBe(false);
  });

  it("skips a load when postal code data is switched off", async () => {
    const { service, downloads } = setup({}, null);
    expect(await service.load("de")).toEqual({ status: "skipped", reason: "off" });
    expect(downloads).toEqual([]);
  });
});
