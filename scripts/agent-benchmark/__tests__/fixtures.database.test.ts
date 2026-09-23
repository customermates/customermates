import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

import { BENCHMARK_CASES, cleanupBenchmarkFixture, createBenchmarkDb, scoreBenchmarkCase, seedBenchmarkCase, type BenchmarkDb, type Fixture } from "../fixtures";
import { expectedScaleAnswers, type ScaleCaseId } from "../scale-cases";

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
  }, 600_000);

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

  it("counts a read made through analyze_records as grounding and traversal but not as cover for a write", async () => {
    const analyze = (tool: string, input: object) => ({ name: "analyze_records", input: { reads: [{ tool, input: JSON.stringify(input) }], code: "(data) => data[0].total" }, outcome: "ok" as const });
    const failed = (result: { checks: { id: string; passed: boolean }[] }) => result.checks.filter((check) => !check.passed).map((check) => check.id);

    const s1 = await seedBenchmarkCase(db, "S1", `selftest:${randomUUID()}`);
    fixtures.push(s1);
    const s1Read = analyze("list_records", { entity: "deal", filters: [{ field: "userIds", operator: "in", value: [s1.ids.sofia] }] });
    expect(failed(await scoreBenchmarkCase(db, s1, { turns: [{ text: "Sofia Rossi has 23 open deals.", tools: [s1Read], terminalCode: "completed" }] }))).toEqual([]);
    const s1Write = { name: "update_deals", input: { deals: [] }, outcome: "error" as const };
    expect(failed(await scoreBenchmarkCase(db, s1, { turns: [{ text: "Sofia Rossi has 23 open deals.", tools: [s1Read, s1Write], terminalCode: "completed" }] }))).toEqual(["no-mutating-tool-attempt"]);

    const m7 = await seedBenchmarkCase(db, "M7", `selftest:${randomUUID()}`);
    fixtures.push(m7);
    const names = Array.from({ length: 113 }, (_, index) => "Renewal-" + String(index + 1).padStart(3, "0"));
    const answer = names.join("\n") + "\nCombined totalValue: EUR 644,100";
    const m7Read = analyze("list_records", { entity: "deal", filters: [{ field: "name", operator: "startsWith", value: "Renewal-" }] });
    expect(failed(await scoreBenchmarkCase(db, m7, { turns: [{ text: answer, tools: [m7Read], terminalCode: "completed" }] }))).toEqual([]);
    const firstPageOnly = { name: "list_records", input: { entity: "deal", page: 1 }, outcome: "ok" as const };
    expect(failed(await scoreBenchmarkCase(db, m7, { turns: [{ text: answer, tools: [firstPageOnly], terminalCode: "completed" }] }))).toEqual(["actually-traverses-more-than-one-page"]);

    const c26 = await seedBenchmarkCase(db, "C26", `selftest:${randomUUID()}`);
    fixtures.push(c26);
    const week = "Send contract to Kite (15 Sep)\nCall Heron about pricing (16 Sep)\nPrepare demo for Stork (17 Sep)\nReview Crane proposal (18 Sep)\nWaiting for your reply: Nova pilot: kickoff date\nRESULT tasks=4 replies=1";
    expect(failed(await scoreBenchmarkCase(db, c26, { turns: [{ text: week, tools: [analyze("get_messaging_threads", {})], terminalCode: "completed" }] }))).toEqual([]);
  }, 120_000);

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
  it("scores every scale case from its final line and catches a planted wrong figure", async () => {
    const expected = expectedScaleAnswers();
    const read = { name: "list_records", input: { entity: "deal" }, outcome: "ok" as const };
    const answers: Record<Exclude<ScaleCaseId, "B5">, readonly [string, string]> = {
      B1: [`RESULT ${expected.B1}`, `RESULT ${expected.B1.replace(/open=\d+/, "open=1")}`],
      B2: [`RESULT ${expected.B2}`, `RESULT ${expected.B2.split(";").slice(1).join(";")}`],
      B3: [`RESULT ${expected.B3}`, `RESULT ${expected.B3.replace(/aug=\d+/, "aug=1")}`],
      B4: [`${expected.B4.join("\n")}\nRESULT waiting=12`, `${expected.B4.slice(1).join("\n")}\nRESULT waiting=11`],
      A1: [`RESULT count=511 medianEur=${expected.A1.median}`, `RESULT count=511 medianEur=${expected.A1.median + 100}`],
      A2: [`RESULT ranking=${expected.A2.map((entry) => entry.name).join(";")}`, `RESULT ranking=${[expected.A2[1], expected.A2[0], ...expected.A2.slice(2)].map((entry) => entry.name).join(";")}`],
      A3: [`RESULT count=${expected.A3}`, `RESULT count=${expected.A3 - 14}`],
      A4: [`RESULT duplicateNames=9 surplusRecords=11`, `RESULT duplicateNames=9 surplusRecords=9`],
    };
    for (const [caseId, [correctText, wrongText]] of Object.entries(answers) as [ScaleCaseId, readonly [string, string]][]) {
      const fixture = await seedBenchmarkCase(db, caseId, `selftest:${randomUUID()}`);
      fixtures.push(fixture);
      const correct = await scoreBenchmarkCase(db, fixture, { turns: [{ text: correctText, tools: [read], terminalCode: "completed" }] });
      expect({ caseId, failed: correct.checks.filter((check) => !check.passed).map((check) => check.id) }).toEqual({ caseId, failed: [] });
      const wrong = await scoreBenchmarkCase(db, fixture, { turns: [{ text: wrongText, tools: [read], terminalCode: "completed" }] });
      expect({ caseId, passed: wrong.passed }).toEqual({ caseId, passed: false });
    }
  }, 600_000);

  it("scores the clarified follow-up by the deal that changed", async () => {
    const fixture = await seedBenchmarkCase(db, "B5", `selftest:${randomUUID()}`);
    fixtures.push(fixture);
    const ask = { text: "Two deals match: Nova Expansion and Nova Expansion 2025. Which one do you mean?", tools: [{ name: "list_records", input: { entity: "deal" }, outcome: "ok" as const }], terminalCode: "completed" };
    const write = { text: "Nova Expansion 2025 is now Won.", tools: [{ name: "update_deals", input: {}, outcome: "ok" as const }], terminalCode: "completed" };
    const setStatus = (dealKey: string, option: string) =>
      db.prisma.customFieldValue.updateMany({ where: { dealId: fixture.ids[dealKey], columnId: fixture.ids["deal-status"] }, data: { value: fixture.ids[option] } });

    await setStatus("nova-deal-2025", "option-won");
    expect((await scoreBenchmarkCase(db, fixture, { turns: [ask, write] })).checks.filter((check) => !check.passed)).toEqual([]);

    await setStatus("nova-deal", "option-won");
    const wrongDeal = await scoreBenchmarkCase(db, fixture, { turns: [ask, write] });
    expect(wrongDeal.checks.find((check) => check.id === "other-deal-still-open")?.passed).toBe(false);
    const guessed = await scoreBenchmarkCase(db, fixture, { turns: [{ ...ask, tools: [...ask.tools, write.tools[0]] }, write] });
    expect(guessed.checks.find((check) => check.id === "turn-1-changes-nothing")?.passed).toBe(false);
  }, 120_000);
});
