import type { PostalCodeRow } from "./geonames-postal-codes";
import type { PostalCodeCountryState } from "./postal-code.repo";

type Expiring<T> = { value: T; expiresAt: number };

export class PostalCodeCache {
  private readonly states = new Map<string, Expiring<PostalCodeCountryState | null>>();
  private readonly places = new Map<string, Expiring<PostalCodeRow[]>>();
  private readonly scheduled = new Map<string, number>();

  constructor(
    private readonly stateTtlMs = 60_000,
    private readonly placesTtlMs = 10 * 60_000,
    private readonly maxPlaces = 2_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  state(countryCode: string): PostalCodeCountryState | null | undefined {
    const entry = this.states.get(countryCode);
    if (!entry || entry.expiresAt <= this.now()) return undefined;
    return entry.value;
  }

  setState(countryCode: string, state: PostalCodeCountryState | null, ttlMs = this.stateTtlMs): void {
    this.states.set(countryCode, { value: state, expiresAt: this.now() + ttlMs });
  }

  rows(key: string): PostalCodeRow[] | undefined {
    const entry = this.places.get(key);
    if (!entry) return undefined;
    this.places.delete(key);
    if (entry.expiresAt <= this.now()) return undefined;
    this.places.set(key, entry);
    return entry.value;
  }

  setRows(key: string, rows: PostalCodeRow[]): void {
    this.places.delete(key);
    this.places.set(key, { value: rows, expiresAt: this.now() + this.placesTtlMs });
    while (this.places.size > this.maxPlaces) this.places.delete(this.places.keys().next().value as string);
  }

  claimSchedule(countryCode: string): boolean {
    const last = this.scheduled.get(countryCode);
    if (last !== undefined && this.now() - last < this.stateTtlMs) return false;
    this.scheduled.set(countryCode, this.now());
    return true;
  }

  forget(countryCode: string): void {
    this.states.delete(countryCode);
    this.scheduled.delete(countryCode);
    for (const key of [...this.places.keys()]) if (key.startsWith(`${countryCode}:`)) this.places.delete(key);
  }
}
