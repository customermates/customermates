import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

import { BENCHMARK_CASES, cleanupBenchmarkFixture, createBenchmarkDb, scoreBenchmarkCase, seedBenchmarkCase, type BenchmarkDb, type Fixture } from "../fixtures";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("agent benchmark fixtures and oracle", () => {
  let db: BenchmarkDb;
  const fixtures: Fixture[] = [];

  beforeAll(async () => {
    db = await createBenchmarkDb(databaseUrl!, "http://localhost:4107");
  });

  afterAll(async () => {
    for (const fixture of fixtures) await cleanupBenchmarkFixture(db, fixture).catch(() => undefined);
    await db.prisma.$disconnect();
  });

  it("seeds every case against the current schema and refuses to reuse a namespace", async () => {
    const runKey = `selftest:${randomUUID()}`;
    for (const definition of BENCHMARK_CASES) {
      const fixture = await seedBenchmarkCase(db, definition.id, runKey);
      fixtures.push(fixture);
      expect(fixture.before.contact).toBeDefined();
    }
    await expect(seedBenchmarkCase(db, "S1", runKey)).rejects.toThrow(/already exists/);
  }, 180_000);

  it("passes a correct synthetic answer and catches a planted wrong one", async () => {
    const fixture = await seedBenchmarkCase(db, "S1", `selftest:${randomUUID()}`);
    fixtures.push(fixture);
    const listCall = { name: "list_records", input: { entity: "deal" }, outcome: "ok" as const };
    const correct = await scoreBenchmarkCase(db, fixture, { turns: [{ text: "Sofia Rossi has 23 open deals.", tools: [listCall], terminalCode: "completed" }] });
    expect(correct.passed).toBe(true);
    const planted = await scoreBenchmarkCase(db, fixture, { turns: [{ text: "Sofia Rossi has 22 open deals.", tools: [listCall], terminalCode: "completed" }] });
    expect(planted.passed).toBe(false);
    expect(planted.checks.filter((check) => !check.passed).map((check) => check.id)).toEqual(["exact-filtered-count-23"]);
  }, 60_000);

  it("scores a complex case from its final line and the database state", async () => {
    const fixture = await seedBenchmarkCase(db, "C27", `selftest:${randomUUID()}`);
    fixtures.push(fixture);
    const read = { name: "list_records", input: { entity: "deal" }, outcome: "ok" as const };
    const answer = "Alpha Rollout (20,000 vs 5,000), Gamma Pilot (30,000 vs 12,000), Epsilon Platform (50,000 vs 10,000) and Zeta Support (6,000 vs 0) are below half.\nRESULT deals=4 gapEur=79000";
    const correct = await scoreBenchmarkCase(db, fixture, { turns: [{ text: answer, tools: [read], terminalCode: "completed" }] });
    expect(correct.passed).toBe(true);
    const wrong = await scoreBenchmarkCase(db, fixture, { turns: [{ text: answer.replace("79000", "73000"), tools: [read], terminalCode: "completed" }] });
    expect(wrong.checks.find((check) => check.id === "gap-79000")?.passed).toBe(false);
  }, 60_000);
});
