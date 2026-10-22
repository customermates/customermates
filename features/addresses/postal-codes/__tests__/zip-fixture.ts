import { zipArchive } from "@/tests/helpers/record-file-fixtures";

export type ZipFixtureEntry = { name: string; content: string; stored?: boolean; checksum?: number };

export function zipFixture(entries: readonly ZipFixtureEntry[]): Buffer {
  const encoder = new TextEncoder();
  return Buffer.from(zipArchive(entries.map(({ content, ...entry }) => ({ ...entry, data: encoder.encode(content) }))));
}

export function geonamesLine(
  country: string,
  postalCode: string,
  place: string,
  admin: { name1?: string; code1?: string; name2?: string; code2?: string; name3?: string; code3?: string } = {},
  latitude = 50,
  longitude = 8,
  accuracy = "4",
): string {
  return [
    country,
    postalCode,
    place,
    admin.name1 ?? "",
    admin.code1 ?? "",
    admin.name2 ?? "",
    admin.code2 ?? "",
    admin.name3 ?? "",
    admin.code3 ?? "",
    String(latitude),
    String(longitude),
    accuracy,
  ].join("\t");
}
