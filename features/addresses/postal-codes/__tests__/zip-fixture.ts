import { deflateRawSync } from "node:zlib";

import { crc32 } from "../postal-code-zip";

export type ZipFixtureEntry = { name: string; content: string; stored?: boolean; checksum?: number };

export function zipFixture(entries: readonly ZipFixtureEntry[]): Buffer {
  const locals: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const content = Buffer.from(entry.content, "utf8");
    const data = entry.stored ? content : deflateRawSync(content);
    const name = Buffer.from(entry.name, "utf8");
    const checksum = entry.checksum ?? crc32(new Uint8Array(content.buffer, content.byteOffset, content.byteLength));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.stored ? 0 : 8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.stored ? 0 : 8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const size = directory.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat(
    [...locals, ...directory, end].map((part) => new Uint8Array(part.buffer, part.byteOffset, part.byteLength)),
  );
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
