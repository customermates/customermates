import type { AddressLookupMatch } from "./address-lookup-provider";

type Entry = { matches: AddressLookupMatch[]; expiresAt: number };

export class AddressLookupCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs = 10 * 60 * 1_000,
    private readonly maxEntries = 500,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): AddressLookupMatch[] | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    if (entry.expiresAt <= this.now()) return null;
    this.entries.set(key, entry);
    return entry.matches;
  }

  set(key: string, matches: AddressLookupMatch[]): void {
    this.entries.delete(key);
    this.entries.set(key, { matches, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
  }
}
