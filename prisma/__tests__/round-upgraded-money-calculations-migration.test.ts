import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { currencyFractionDigits } from "@/features/records/derived-value-format";
import {
  DYNAMIC_RECORD_MODEL_MIGRATION,
  migrationDirectories,
  readMigration,
} from "@/tests/helpers/legacy-migration-database";

const MIGRATION = "20261015100000_round_upgraded_money_calculations";

async function migrationCurrencies() {
  const sql = await readFile(resolve("prisma/migrations", MIGRATION, "migration.sql"), "utf8");
  const insert = sql.slice(sql.indexOf("INSERT INTO crm_money_currency"));
  const rows = insert.slice(0, insert.indexOf(";"));
  return [...rows.matchAll(/\('([A-Z]{3})', (\d)\)/gu)].map(([, code, digits]) => ({ code, digits: Number(digits) }));
}

async function legacyWorkspaceCurrencies() {
  const codes = new Set<string>();
  for (const migration of await migrationDirectories((name) => name < DYNAMIC_RECORD_MODEL_MIGRATION)) {
    const sql = await readMigration(migration);
    for (const [, values] of sql.matchAll(/CREATE TYPE "Currency" AS ENUM \(([^)]*)\)/gu))
      for (const [, code] of values.matchAll(/'([a-z]{3})'/gu)) codes.add(code.toUpperCase());
    for (const [, code] of sql.matchAll(/ALTER TYPE "Currency" ADD VALUE '([a-z]{3})'/gu))
      codes.add(code.toUpperCase());
  }
  return [...codes].sort();
}

describe("rounding the money calculations of upgraded workspaces", () => {
  it("rounds to the fraction digits the record engine uses for every former workspace currency", async () => {
    const currencies = await migrationCurrencies();

    expect(currencies.map(({ code }) => code)).toEqual(await legacyWorkspaceCurrencies());
    expect(currencies.filter(({ code, digits }) => currencyFractionDigits(code) !== digits)).toEqual([]);
  });
});
