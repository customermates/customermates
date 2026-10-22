import * as Sentry from "@sentry/nextjs";

import type { AddressFormatSource } from "../address-country-format";
import type { PostalCodePlace } from "../address-check";
import type { ProviderFileResult } from "../address-lookup-request";
import type { PostalCodeCache } from "./postal-code-cache";
import type { PostalCodeRow, PostalCodeSourceRows } from "./geonames-postal-codes";
import type { PostalCodeCountryState, PostalCodeRepo } from "./postal-code.repo";

import { afterCommit } from "@/core/decorators/after-commit";
import {
  geoNamesPostalCodeRows,
  MAX_ROWS_PER_CODE,
  postalCodeRows,
  validPostalCodeShare,
} from "./geonames-postal-codes";
import { isPostalCodeDataError, readZipEntry } from "./postal-code-zip";
import {
  postalCodeCityChecked,
  postalCodeFormatCheckable,
  postalCodeLookupKeys,
  postalCodeSources,
} from "./postal-code-sources";

export type PostalCodeLookup =
  | {
      status: "ready";
      match: "exact" | "area" | "none";
      cityChecked: boolean;
      postalCode: string | null;
      places: PostalCodePlace[];
    }
  | { status: "pending" | "unavailable" };

type PostalCodeLoadOutcome =
  | { status: "ready"; rows: number }
  | { status: "skipped" | "failed" | "unavailable"; reason: string };

type PostalCodeDownload = (url: URL) => Promise<ProviderFileResult>;
type PostalCodeDispatch = (countryCode: string) => Promise<void>;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const STALE_CLAIM_MS = 15 * MINUTE;
const UNSETTLED_STATE_TTL_MS = 3_000;
const REFRESH_AFTER_MS = 90 * DAY;
const UNAVAILABLE_RETRY_MS = 30 * DAY;
const MAX_TEXT_BYTES = 96 * 1024 * 1024;
const MIN_VALID_SHARE = 0.9;
const MAX_SHRINK = 0.5;

export function postalCodeLoadDue(state: PostalCodeCountryState | null, version: string, now: Date): boolean {
  if (!state) return true;
  const since = now.getTime() - state.attemptedAt.getTime();
  if (state.status === "loading") return since > STALE_CLAIM_MS;
  if (state.status === "failed") return since > Math.min(DAY, HOUR * 2 ** Math.max(0, state.attempts - 1));
  if (state.status === "unavailable") return since > UNAVAILABLE_RETRY_MS;
  const stale = !state.loadedAt || now.getTime() - state.loadedAt.getTime() > REFRESH_AFTER_MS;
  return (state.version !== version || stale) && since > HOUR;
}

function placeOf(row: PostalCodeRow): PostalCodePlace {
  return { city: row.city, region: row.region, latitude: row.latitude, longitude: row.longitude };
}

function described(result: Extract<ProviderFileResult, { ok: false }>): string {
  return result.status ? `${result.reason} ${result.status}` : result.reason;
}

export class PostalCodeService {
  constructor(
    private readonly repo: PostalCodeRepo,
    private readonly cache: PostalCodeCache,
    private readonly baseUrl: string | null,
    private readonly version: string,
    private readonly formatOf: AddressFormatSource,
    private readonly dispatch: PostalCodeDispatch,
    private readonly download: PostalCodeDownload,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async state(countryCode: string): Promise<PostalCodeCountryState | null> {
    const cached = this.cache.state(countryCode);
    if (cached !== undefined) return cached;
    const state = await this.repo.country(countryCode);
    this.cache.setState(countryCode, state, state?.status === "ready" ? undefined : UNSETTLED_STATE_TTL_MS);
    return state;
  }

  private async schedule(countryCode: string, state: PostalCodeCountryState | null): Promise<void> {
    if (!this.baseUrl || !postalCodeLoadDue(state, this.version, this.now())) return;
    if (!this.cache.claimSchedule(countryCode)) return;
    await afterCommit(async () => {
      try {
        if (await this.repo.claim(countryCode, this.version, state, this.now())) await this.dispatch(countryCode);
      } catch (error) {
        Sentry.captureException(error, { tags: { kind: "postal-code-load-dispatch", countryCode } });
      } finally {
        this.cache.forget(countryCode);
        this.cache.claimSchedule(countryCode);
      }
    });
  }

  async lookup(countryCode: string, postalCode: string): Promise<PostalCodeLookup> {
    const state = await this.state(countryCode);
    await this.schedule(countryCode, state);
    if (state?.status !== "ready")
      return { status: !this.baseUrl || state?.status === "unavailable" ? "unavailable" : "pending" };
    const { keys, exact } = postalCodeLookupKeys(countryCode, postalCode);
    const cacheKey = `${countryCode}:${keys[0] ?? ""}`;
    const rows = this.cache.rows(cacheKey) ?? (await this.repo.places(countryCode, keys));
    this.cache.setRows(cacheKey, rows);
    const key = keys.find((candidate) => rows.some((row) => row.postalKey === candidate));
    const matched = key ? rows.filter((row) => row.postalKey === key) : [];
    return {
      status: "ready",
      match: !key ? "none" : exact.has(key) ? "exact" : "area",
      cityChecked: postalCodeCityChecked(countryCode) && matched.length < MAX_ROWS_PER_CODE,
      postalCode: matched[0]?.postalCode ?? null,
      places: matched.map(placeOf),
    };
  }

  async load(countryCode: string): Promise<PostalCodeLoadOutcome> {
    if (!this.baseUrl) return { status: "skipped", reason: "off" };
    const now = this.now();
    const previous = await this.repo.country(countryCode);
    const format = this.formatOf(countryCode);
    const parsed: PostalCodeSourceRows[] = [];
    const fail = async (status: "failed" | "unavailable", reason: string): Promise<PostalCodeLoadOutcome> => {
      await this.repo.fail(countryCode, status, reason, now);
      this.cache.forget(countryCode);
      return { status, reason };
    };
    for (const source of postalCodeSources(countryCode)) {
      const result = await this.download(new URL(`${this.baseUrl}/${source.file}`));
      if (!result.ok) {
        if (!source.required) continue;
        return fail(result.reason === "status" && result.status === 404 ? "unavailable" : "failed", described(result));
      }
      try {
        const content = readZipEntry(result.body, source.entry, MAX_TEXT_BYTES);
        const text = new TextDecoder("utf-8", { fatal: true }).decode(content);
        const rows = geoNamesPostalCodeRows(text, source.region ?? countryCode);
        parsed.push({ rows: source.required ? rows : [...rows], region: source.region });
      } catch (error) {
        if (!source.required) continue;
        return fail("failed", error instanceof Error ? error.message : "unreadable");
      }
    }
    let rows: PostalCodeRow[];
    try {
      rows = postalCodeRows(parsed, format);
    } catch (error) {
      if (!isPostalCodeDataError(error)) throw error;
      return fail("failed", error.message);
    }
    if (!rows.length) return fail("failed", "no postal codes");
    if (postalCodeFormatCheckable(countryCode) && format.postalCode) {
      const share = validPostalCodeShare(rows, format);
      if (share < MIN_VALID_SHARE)
        return fail("failed", `only ${Math.round(share * 100)}% of the postal codes match the country's format`);
    }
    if (previous?.status === "ready" && previous.rowCount > 0 && rows.length < previous.rowCount * MAX_SHRINK)
      return fail("failed", `the new data has ${rows.length} rows instead of ${previous.rowCount}`);
    await this.repo.replace(countryCode, this.version, rows, now);
    this.cache.forget(countryCode);
    return { status: "ready", rows: rows.length };
  }
}
