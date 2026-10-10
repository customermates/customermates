import { Prisma } from "@/generated/prisma";

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

function digit(character: string): number {
  const index = DIGITS.indexOf(character);
  if (index < 0) throw new Error("Rank keys use digits and lowercase letters only");
  return index;
}

export function rankBetween(lower: string | null, upper: string | null): string {
  if (lower !== null && upper !== null && lower >= upper) throw new Error("The lower rank must sort before the upper");
  let prefix = "";
  let bounded = upper !== null;
  for (let index = 0; ; index++) {
    const low = lower !== null && index < lower.length ? digit(lower[index]) : -1;
    const high = bounded && upper !== null && index < upper.length ? digit(upper[index]) : DIGITS.length;
    if (low === high) {
      prefix += DIGITS[low];
      continue;
    }
    if (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      return middle === 0 ? `${prefix}0${DIGITS[DIGITS.length >> 1]}` : prefix + DIGITS[middle];
    }
    if (low >= 0) {
      prefix += DIGITS[low];
      bounded = false;
    } else prefix += DIGITS[0];
  }
}

export function recordManualOrderKey(record: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`COALESCE(${record}."rank", lpad((9999999999999999 - floor(extract(epoch FROM ${record}."createdAt") * 1000000))::bigint::text, 16, '0') || regexp_replace(lower(${record}."id"), '[^0-9a-z]', '', 'g') || 'v') COLLATE "C"`;
}
