import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

import { fullTextUnits, fullTextUnitsCte } from "../full-text-query";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("Full-text compound query semantics on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });

  beforeAll(async () => {
    await client.connect();
  });
  afterAll(() => client.end());

  async function matches(query: string, document: string) {
    const sql = Prisma.sql`WITH ${fullTextUnitsCte({
      units: fullTextUnits(query),
      configs: ["english", "german"],
      stopConfig: "german",
    })}
      SELECT EXISTS (SELECT 1 FROM units WHERE to_tsvector('simple', ${document}) @@ "query") AS matched`;
    const result = await client.query<{ matched: boolean }>(sql.text, sql.values);
    return result.rows[0].matched;
  }

  it("finds alphabetic components stored as separate words and retains the exact compound", async () => {
    expect(await matches("support-response", "support response")).toBe(true);
    expect(await matches("support-response", "support-response")).toBe(true);
    expect(await matches("Richtlinien-Seite", "Richtlinien Seite")).toBe(true);
  });

  it("does not broaden a quoted compound phrase to separate component words", async () => {
    expect(await matches('"support-response"', "support response")).toBe(false);
    expect(await matches('"support-response"', "support-response")).toBe(true);
    expect(await matches('"Account Policies-Seite"', "Account Policies Seite")).toBe(false);
    expect(await matches('"Account Policies-Seite"', "Account Policies-Seite")).toBe(true);
  });
});
