const DELIMITER_CANDIDATES = [",", ";", "\t", "|"] as const;
const SNIFF_RECORDS = 50;
const SNIFF_CHARACTERS = 64 * 1024;

export function decodeSpreadsheetText(bytes: Uint8Array): string | null {
  let text: string;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    text = new TextDecoder("utf-8").decode(bytes.subarray(3));
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder("utf-16le").decode(bytes.subarray(2));
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder("utf-16be").decode(bytes.subarray(2));
  else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder("windows-1252").decode(bytes);
    }
  }
  if (text.includes("\u0000")) return null;
  return text.replace(/^﻿/, "");
}

export function parseCsvRecords(text: string, delimiter: string, limit = Number.POSITIVE_INFINITY): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;
  const endRecord = () => {
    record.push(field);
    records.push(record);
    record = [];
    field = "";
  };
  while (index < text.length && records.length < limit) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += character;
      index += 1;
      continue;
    }
    if (character === '"' && field.trim() === "") {
      quoted = true;
      field = "";
      index += 1;
      continue;
    }
    if (character === delimiter) {
      record.push(field);
      field = "";
      index += 1;
      continue;
    }
    if (character === "\r" || character === "\n") {
      endRecord();
      index += character === "\r" && text[index + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += character;
    index += 1;
  }
  if (records.length < limit && (field !== "" || record.length > 0)) endRecord();
  return records;
}

export function detectCsvDelimiter(text: string): string {
  const sample = text.slice(0, SNIFF_CHARACTERS);
  let best: { delimiter: string; consistency: number; width: number } = { delimiter: ",", consistency: 0, width: 1 };
  for (const delimiter of DELIMITER_CANDIDATES) {
    const widths = parseCsvRecords(sample, delimiter, SNIFF_RECORDS)
      .filter((record) => record.some((value) => value.trim() !== ""))
      .map((record) => record.length);
    if (!widths.length) continue;
    const counts = new Map<number, number>();
    for (const width of widths) counts.set(width, (counts.get(width) ?? 0) + 1);
    const [width, count] = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0])[0];
    if (width < 2) continue;
    const consistency = count / widths.length;
    if (consistency > best.consistency || (consistency === best.consistency && width > best.width))
      best = { delimiter, consistency, width };
  }
  return best.delimiter;
}

export function readCsvRows(
  bytes: Uint8Array,
  recordLimit: number,
): { rows: Array<{ rowNumber: number; cells: string[] }>; truncated: boolean } | null {
  const decoded = decodeSpreadsheetText(bytes);
  if (decoded === null) return null;
  const directive = /^sep=(.)\r?\n/i.exec(decoded);
  const text = directive ? decoded.slice(directive[0].length) : decoded;
  const delimiter = directive ? directive[1] : detectCsvDelimiter(text);
  const offset = directive ? 1 : 0;
  const records = parseCsvRecords(text, delimiter, recordLimit + 1);
  return {
    rows: records.slice(0, recordLimit).map((cells, index) => ({ rowNumber: index + 1 + offset, cells })),
    truncated: records.length > recordLimit,
  };
}
