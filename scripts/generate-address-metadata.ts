import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { format } from "prettier";

import {
  addressMetadataJson,
  buildAddressMetadata,
  type LibaddressinputEntry,
  type LibaddressinputSnapshot,
} from "./address-metadata/build-address-metadata";

const ROOT = process.cwd();
export const ADDRESS_METADATA_SNAPSHOT_PATH = join(ROOT, "scripts", "address-metadata", "libaddressinput.json");
export const ADDRESS_METADATA_PATH = join(ROOT, "features", "addresses", "address-metadata.json");
const SERVICE_URL = "https://chromium-i18n.appspot.com/ssl-address";
const LICENSE = "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), address metadata © Google";
const PARALLEL_REQUESTS = 6;

export function readAddressMetadataSnapshot(path = ADDRESS_METADATA_SNAPSHOT_PATH): LibaddressinputSnapshot {
  return JSON.parse(readFileSync(path, "utf8")) as LibaddressinputSnapshot;
}

export function formatAddressMetadata(snapshot: LibaddressinputSnapshot): Promise<string> {
  return format(addressMetadataJson(buildAddressMetadata(snapshot)), { parser: "json", printWidth: 120 });
}

async function fetchEntry(id: string): Promise<LibaddressinputEntry> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${SERVICE_URL}/${id}`, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (response.ok) {
      const entry = (await response.json()) as LibaddressinputEntry;
      if (entry.id !== id) throw new Error(`${id}: the service answered with ${entry.id}`);
      return entry;
    }
    if (attempt >= 3) throw new Error(`${id}: HTTP ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
}

async function inBatches<T, R>(items: readonly T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += PARALLEL_REQUESTS)
    results.push(...(await Promise.all(items.slice(index, index + PARALLEL_REQUESTS).map(run))));
  return results;
}

function sorted<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => (left < right ? -1 : 1)));
}

async function refreshSnapshot(): Promise<LibaddressinputSnapshot> {
  const index = await fetchEntry("data");
  const countries = (index.countries ?? "").split("~").filter(Boolean);
  if (countries.length < 200) throw new Error(`The service lists only ${countries.length} countries`);
  const entries: Record<string, LibaddressinputEntry> = { "data/ZZ": await fetchEntry("data/ZZ") };
  for (const entry of await inBatches(countries, (country) => fetchEntry(`data/${country}`))) {
    entries[entry.id] = entry;
  }
  const variants = Object.values(entries).flatMap((entry) =>
    (entry.languages ?? "")
      .split("~")
      .filter((language) => language && language !== entry.lang)
      .map((language) => `${entry.id}--${language}`),
  );
  for (const entry of await inBatches(variants, fetchEntry)) entries[entry.id] = entry;
  return {
    license: LICENSE,
    retrievedOn: new Date().toISOString().slice(0, 10),
    url: `${SERVICE_URL}/data`,
    entries: sorted(Object.fromEntries(Object.entries(entries).map(([id, entry]) => [id, sorted({ ...entry })]))),
  };
}

async function main() {
  if (process.argv.includes("--refresh")) {
    const snapshot = await refreshSnapshot();
    writeFileSync(ADDRESS_METADATA_SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`${ADDRESS_METADATA_SNAPSHOT_PATH}: ${Object.keys(snapshot.entries).length} entries`);
  }
  const output = await formatAddressMetadata(readAddressMetadataSnapshot());
  writeFileSync(ADDRESS_METADATA_PATH, output);
  console.log(`${ADDRESS_METADATA_PATH}: ${Buffer.byteLength(output)} bytes`);
}

if (process.argv[1]?.endsWith("generate-address-metadata.ts")) void main();
