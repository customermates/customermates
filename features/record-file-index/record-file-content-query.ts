import { Prisma } from "@/generated/prisma";

import { fullTextUnitQuery, fullTextUnits } from "@/core/retrieval/full-text-query";
import { LOCALE_REGISTRY, REGISTERED_LOCALES } from "@/i18n/locale-registry";

export const RECORD_FILE_FULL_TEXT_CONFIGS: readonly string[] = [
  ...new Set(REGISTERED_LOCALES.map((code) => LOCALE_REGISTRY[code].textSearchConfig)),
];

export function recordFileContentMatch(search: string, chunk: Prisma.Sql): Prisma.Sql | null {
  const units = fullTextUnits(search);
  const words = units.filter((unit) => !unit.substring);
  const parts = units
    .filter((unit) => unit.substring)
    .map((unit) => Prisma.sql`strpos(lower(${chunk}."text"), ${unit.text}) > 0`);
  if (words.length) {
    parts.unshift(
      Prisma.sql`${chunk}."searchVector" @@ (${Prisma.join(
        words.map((unit) => fullTextUnitQuery(unit, ["simple", ...RECORD_FILE_FULL_TEXT_CONFIGS])),
        " && ",
      )})`,
    );
  }
  return parts.length ? Prisma.sql`(${Prisma.join(parts, " AND ")})` : null;
}
