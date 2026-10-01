import { presetId } from "@/features/records/crm-preset";
import { randomUUID } from "node:crypto";
import { parseMarkdownToJSON, serializeJSONToMarkdown } from "@/components/editor/editor.utils";
import { RecordFieldSchema, RecordModelSchema } from "@/features/records/record-model.schema";
import { recordJson } from "@/features/records/record-storage";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { agentCreditPeriodForAnchor } from "@/ee/agent-chat/agent-credit-policy";
import { PrismaAgentChatRepo } from "@/ee/agent-chat/prisma-agent-chat.repository";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

import { BENCHMARK_CASES, cleanupBenchmarkFixture, createBenchmarkDb, scoreBenchmarkCase, seedBenchmarkCase, type BenchmarkDb, type Fixture } from "../fixtures";

vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return {
    env: {
      ...actual.env,
      APP_MODE: "cloud",
      HOSTED_AI_OPERATOR_CONTROLS_ENABLED: false,
    },
  };
});

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
      const fixture = await seedBenchmarkCase(db, definition.id, runKey, 12);
      fixtures.push(fixture);
      expect(fixture.before.contact).toBeDefined();
    }
    await expect(seedBenchmarkCase(db, "S1", runKey, 12)).rejects.toThrow(/already exists/);
  }, 180_000);

  it("passes a correct synthetic answer and catches a planted wrong one", async () => {
    const fixture = await seedBenchmarkCase(db, "S1", `selftest:${randomUUID()}`, 12);
    fixtures.push(fixture);
    const listCall = { name: "query_crm_records", input: { typeId: presetId(fixture.companyId, "deal") }, outcome: "ok" as const };
    const correct = await scoreBenchmarkCase(db, fixture, { turns: [{ text: "Sofia Rossi has 23 open deals.", tools: [listCall], terminalCode: "completed" }] });
    expect(correct.passed).toBe(true);
    const planted = await scoreBenchmarkCase(db, fixture, { turns: [{ text: "Sofia Rossi has 22 open deals.", tools: [listCall], terminalCode: "completed" }] });
    expect(planted.passed).toBe(false);
    expect(planted.checks.filter((check) => !check.passed).map((check) => check.id)).toEqual(["exact-filtered-count-23"]);
    const retired = await scoreBenchmarkCase(db, fixture, { turns: [{ text: "Sofia Rossi has 23 open deals.", tools: [{ ...listCall, name: "list_records" }], terminalCode: "completed" }] });
    expect(retired.checks.find((check) => check.id === "current-record-tool-contract")?.passed).toBe(false);
  }, 60_000);

  it("accepts native note and select mutations and catches an unrelated record edit", async () => {
    const noteFixture = await seedBenchmarkCase(db, "M5", `selftest:${randomUUID()}`, 12);
    fixtures.push(noteFixture);
    const deal = noteFixture.before.deal.find((row) => (row as { id: string }).id === noteFixture.ids["nova-deal"]) as { notes: object };
    const appended = "2026-09-05: Procurement requested the revised security questionnaire by 2026-09-10.";
    const notes = parseMarkdownToJSON(`${serializeJSONToMarkdown(deal.notes)}\n\n${appended}`);
    await db.prisma.recordValue.updateMany({ where: { companyId: noteFixture.companyId, typeId: presetId(noteFixture.companyId, "deal"), recordId: noteFixture.ids["nova-deal"], fieldId: presetId(noteFixture.companyId, "deal.notes") }, data: { jsonValue: recordJson(notes) } });
    const noteCall = { name: "mutate_crm_record", input: { mutation: { action: "update", ref: { typeId: presetId(noteFixture.companyId, "deal"), recordId: noteFixture.ids["nova-deal"] }, fields: [{ fieldId: presetId(noteFixture.companyId, "deal.notes") }] } }, outcome: "ok" as const };
    const noteScore = await scoreBenchmarkCase(db, noteFixture, { turns: [{ text: "Appended the requested note.", tools: [noteCall], terminalCode: "completed" }] });
    expect(noteScore.checks.filter((check) => !check.passed)).toEqual([]);

    const statusFixture = await seedBenchmarkCase(db, "N17", `selftest:${randomUUID()}`, 12);
    fixtures.push(statusFixture);
    for (const target of ["helios-renewal", "helios-pilot"]) {
      await db.prisma.recordValue.updateMany({ where: { companyId: statusFixture.companyId, typeId: presetId(statusFixture.companyId, "deal"), recordId: statusFixture.ids[target], fieldId: statusFixture.ids["deal-status"] }, data: { textValue: statusFixture.ids["option-won"] } });
      await db.prisma.crmRecord.updateMany({ where: { companyId: statusFixture.companyId, typeId: presetId(statusFixture.companyId, "deal"), id: statusFixture.ids[target] }, data: { version: { increment: 1 } } });
    }
    const statusCall = { name: "mutate_crm_record", input: { mutation: { action: "update", ref: { typeId: presetId(statusFixture.companyId, "deal"), recordId: statusFixture.ids["helios-renewal"] }, fields: [{ fieldId: statusFixture.ids["deal-status"] }] } }, outcome: "ok" as const };
    const observed = { turns: [{ text: "Updated the two requested deals.", tools: [statusCall], terminalCode: "completed" }] };
    const correct = await scoreBenchmarkCase(db, statusFixture, observed);
    expect(correct.checks.filter((check) => !check.passed)).toEqual([]);
    await db.prisma.recordValue.updateMany({ where: { companyId: statusFixture.companyId, recordId: statusFixture.ids["decoy-2203"], fieldId: presetId(statusFixture.companyId, "deal.name") }, data: { textValue: "Collateral change" } });
    const planted = await scoreBenchmarkCase(db, statusFixture, observed);
    expect(planted.checks.find((check) => check.id === "non-custom-tables-unchanged")?.passed).toBe(false);
  }, 120_000);

  it("scores a native configuration revision without ignoring record or permission changes", async () => {
    const fixture = await seedBenchmarkCase(db, "C30", `selftest:${randomUUID()}`, 12);
    fixtures.push(fixture);
    const model = RecordModelSchema.parse(fixture.before["generic:model"][0]);
    const template = model.fields.find((field) => field.id === presetId(fixture.companyId, "contact.firstName"));
    if (!template) throw new Error("Oracle field template is missing");
    const fields = [
      RecordFieldSchema.parse({ ...template, id: randomUUID(), typeId: presetId(fixture.companyId, "deal"), label: "Placement stage", valueType: "select", position: 20, options: ["Sourcing", "Interviewing", "Offer", "Placed", "Lost"].map((label) => ({ id: randomUUID(), label, color: null, attributes: [] })) }),
      RecordFieldSchema.parse({ ...template, id: randomUUID(), typeId: presetId(fixture.companyId, "deal"), label: "Placement fee", valueType: "currency", position: 21, format: { currency: "EUR" } }),
      RecordFieldSchema.parse({ ...template, id: randomUUID(), label: "LinkedIn profile", valueType: "url", position: 20 }),
    ];
    const revised = { ...model, revision: model.revision + 1, fields: [...model.fields, ...fields] };
    await db.prisma.$transaction(async (tx) => {
      for (const field of fields) await tx.recordFieldDefinition.create({ data: { companyId: fixture.companyId, id: field.id, typeId: field.typeId, valueType: field.valueType, behavior: field.behavior.kind, archived: false, definition: recordJson(field) } });
      await tx.recordSchemaRevision.create({ data: { companyId: fixture.companyId, revision: revised.revision, actorId: fixture.actorUserId, snapshot: recordJson(revised) } });
      await tx.recordSchemaState.update({ where: { companyId: fixture.companyId }, data: { revision: revised.revision } });
      await tx.recordValue.updateMany({ where: { companyId: fixture.companyId }, data: { schemaRevision: revised.revision } });
    });
    const observed = { turns: [{ text: "Created the three requested fields.", tools: [{ name: "configure_record_model", input: { action: "apply" }, outcome: "ok" as const }], terminalCode: "completed" }] };
    const correct = await scoreBenchmarkCase(db, fixture, observed);
    expect(correct.checks.filter((check) => !check.passed)).toEqual([]);
    await db.prisma.recordValue.updateMany({ where: { companyId: fixture.companyId, recordId: fixture.ids["cand-1"], fieldId: presetId(fixture.companyId, "contact.firstName") }, data: { textValue: "Collateral" } });
    const planted = await scoreBenchmarkCase(db, fixture, observed);
    expect(planted.checks.find((check) => check.id === "records-untouched")?.passed).toBe(false);
  }, 60_000);

  it("accepts R49 digit and word counts only for the requested entity on each turn", async () => {
    const fixture = await seedBenchmarkCase(db, "R49", `selftest:${randomUUID()}`, 12);
    fixtures.push(fixture);
    const observed = (contactText: string, organizationText: string) => ({
      turns: [
        { text: contactText, tools: [], terminalCode: "completed" },
        { text: organizationText, tools: [], terminalCode: "completed" },
      ],
    });

    const correct = await scoreBenchmarkCase(
      db,
      fixture,
      observed("There is 1 contact in this workspace.", "One organization is in this workspace."),
    );
    expect(correct.passed).toBe(true);
    expect(correct.checks.find((check) => check.id === "both-counts-reported")?.passed).toBe(true);

    const wrong = await scoreBenchmarkCase(
      db,
      fixture,
      observed("There are 2 contacts and 1 organization in this workspace.", "One contact is in this workspace."),
    );
    expect(wrong.passed).toBe(false);
    expect(wrong.checks.find((check) => check.id === "both-counts-reported")?.passed).toBe(false);
  }, 60_000);

  it("enforces the fixture credit ceiling across reservation extensions", async () => {
    const fixture = await seedBenchmarkCase(
      db,
      "S1",
      `selftest:${randomUUID()}`,
      12,
    );
    fixtures.push(fixture);
    const subscription = await db.prisma.subscription.findUniqueOrThrow({
      where: { companyId: fixture.companyId },
    });
    expect(subscription).toMatchObject({
      status: "active",
      plan: "enterprise",
      enterpriseAgentCreditsPerUser: 12,
    });

    const conversationId = randomUUID();
    const turnRequestId = randomUUID();
    const period = agentCreditPeriodForAnchor(
      subscription.agentCreditAnchorAt!,
      new Date(),
    );
    await db.prisma.agentConversation.create({
      data: {
        id: conversationId,
        companyId: fixture.companyId,
        userId: fixture.actorUserId,
      },
    });
    await db.prisma.agentTurnRequest.create({
      data: {
        id: turnRequestId,
        companyId: fixture.companyId,
        userId: fixture.actorUserId,
        conversationId,
        clientRequestId: randomUUID(),
        text: "Benchmark ceiling probe",
        status: "completed",
        runId: randomUUID(),
        userMessageId: randomUUID(),
        terminalCode: "completed",
        terminalAt: new Date(),
      },
    });
    await db.prisma.agentUsageEvent.create({
      data: {
        companyId: fixture.companyId,
        userId: fixture.actorUserId,
        turnRequestId,
        sessionId: randomUUID(),
        state: "reserved",
        reservedCredits: 1,
        chargedCredits: 0,
        planSnapshot: "enterprise",
        subscriptionStatusSnapshot: "active",
        allowanceCreditsSnapshot: 12,
        periodStart: period.start,
        periodEnd: period.resetAt,
      },
    });

    const repo = new PrismaAgentChatRepo();
    await expect(
      runWithoutTenant(() =>
        repo.extendUsageReservationUnscoped({
          turnRequestId,
          companyId: fixture.companyId,
          userId: fixture.actorUserId,
          requiredCredits: 12,
        }),
      ),
    ).resolves.toEqual({ disposition: "extended", reservedCredits: 12 });
    await expect(
      runWithoutTenant(() =>
        repo.extendUsageReservationUnscoped({
          turnRequestId,
          companyId: fixture.companyId,
          userId: fixture.actorUserId,
          requiredCredits: 13,
        }),
      ),
    ).resolves.toEqual({ disposition: "credit_limit" });

    const reservations = await db.prisma.agentUsageEvent.findMany({
      where: { companyId: fixture.companyId },
      select: { reservedCredits: true },
    });
    expect(reservations).toHaveLength(1);
    expect(
      reservations.every((row) => row.reservedCredits <= 12),
    ).toBe(true);
  }, 60_000);

  it("scores a complex case from its final line and the database state", async () => {
    const fixture = await seedBenchmarkCase(db, "C27", `selftest:${randomUUID()}`, 12);
    fixtures.push(fixture);
    const read = { name: "query_crm_records", input: { typeId: presetId(fixture.companyId, "deal") }, outcome: "ok" as const };
    const answer = "Alpha Rollout (20,000 vs 5,000), Gamma Pilot (30,000 vs 12,000), Epsilon Platform (50,000 vs 10,000) and Zeta Support (6,000 vs 0) are below half.\nRESULT deals=4 gapEur=79000";
    const correct = await scoreBenchmarkCase(db, fixture, { turns: [{ text: answer, tools: [read], terminalCode: "completed" }] });
    expect(correct.passed).toBe(true);
    const wrong = await scoreBenchmarkCase(db, fixture, { turns: [{ text: answer.replace("79000", "73000"), tools: [read], terminalCode: "completed" }] });
    expect(wrong.checks.find((check) => check.id === "gap-79000")?.passed).toBe(false);
  }, 60_000);

});
