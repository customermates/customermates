import { presetId } from "@/features/records/crm-preset";
import { prismaAgentChatRepoDependencies } from "@/tests/helpers/prisma-agent-chat-repo";
import { randomUUID } from "node:crypto";
import { parseMarkdownToJSON, serializeJSONToMarkdown } from "@/components/editor/editor.utils";
import { RecordFieldSchema, RecordModelSchema } from "@/features/records/record-model.schema";
import { recordJson } from "@/features/records/record-storage";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { agentCreditPeriodForAnchor } from "@/ee/agent-chat/agent-credit-policy";
import { PrismaAgentChatRepo } from "@/ee/agent-chat/prisma-agent-chat.repository";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import type * as EnvModule from "@/env";

import {
  BENCHMARK_CASES,
  cleanupBenchmarkFixture,
  createBenchmarkDb,
  scoreBenchmarkCase,
  seedBenchmarkCase,
  type BenchmarkDb,
  type Fixture,
} from "../fixtures";
import { expectedScaleAnswers, type ScaleCaseId } from "../scale-cases";

vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
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
    if (!databaseUrl) throw new Error("Local database URL required");
    db = await createBenchmarkDb(databaseUrl, "http://localhost:4107");
  });

  afterAll(async () => {
    for (const fixture of fixtures) await cleanupBenchmarkFixture(db, fixture).catch(() => undefined);
    await db.prisma.$disconnect();
  }, 60_000);

  it("seeds every case against the current schema and refuses to reuse a namespace", async () => {
    const runKey = `selftest:${randomUUID()}`;
    for (const definition of BENCHMARK_CASES) {
      const fixture = await seedBenchmarkCase(db, definition.id, runKey, 12);
      fixtures.push(fixture);
      expect(fixture.before.contact).toBeDefined();
    }
    await expect(seedBenchmarkCase(db, "S1", runKey, 12)).rejects.toThrow(/already exists/);
  }, 600_000);

  it("passes a correct synthetic answer and catches a planted wrong one", async () => {
    const fixture = await seedBenchmarkCase(db, "S1", `selftest:${randomUUID()}`, 12);
    fixtures.push(fixture);
    const listCall = { name: "query_crm_records", input: { typeId: presetId(fixture.companyId, "deal") }, outcome: "ok" as const };
    const correct = await scoreBenchmarkCase(db, fixture, { turns: [{ text: "Sofia Rossi has 23 open deals.", tools: [listCall], terminalCode: "completed" }] });
    expect(correct.passed).toBe(true);
    const planted = await scoreBenchmarkCase(db, fixture, {
      turns: [{ text: "Sofia Rossi has 22 open deals.", tools: [listCall], terminalCode: "completed" }],
    });
    expect(planted.passed).toBe(false);
    expect(planted.checks.filter((check) => !check.passed).map((check) => check.id)).toEqual(["exact-filtered-count-23"]);
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

    for (const [contactText, organizationText] of [
      ["There is **1** contact in this workspace.", "There is __one__ organization."],
      ["There is *1* contact.", "`1` organization is in this workspace."],
      ["**Contacts:** 1", "_Organization count_: **one**"],
    ]) {
      const emphasized = await scoreBenchmarkCase(db, fixture, observed(contactText, organizationText));
      expect(emphasized.checks.find((check) => check.id === "both-counts-reported")?.passed).toBe(true);
    }
    const emphasizedWrong = await scoreBenchmarkCase(
      db,
      fixture,
      observed("There are **2** contacts and **1** organization.", "**One** contact is here."),
    );
    expect(emphasizedWrong.checks.find((check) => check.id === "both-counts-reported")?.passed).toBe(false);

    const wrong = await scoreBenchmarkCase(
      db,
      fixture,
      observed("There are 2 contacts and 1 organization in this workspace.", "One contact is in this workspace."),
    );
    expect(wrong.passed).toBe(false);
    expect(wrong.checks.find((check) => check.id === "both-counts-reported")?.passed).toBe(false);
  }, 60_000);

  it("enforces the fixture credit ceiling across reservation extensions", async () => {
    const fixture = await seedBenchmarkCase(db, "S1", `selftest:${randomUUID()}`, 12);
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
    if (!subscription.agentCreditAnchorAt) throw new Error("Expected seeded credit anchor");
    const period = agentCreditPeriodForAnchor(subscription.agentCreditAnchorAt, new Date());
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
        reservedMicrocents: 1_000_000n,
        planSnapshot: "enterprise",
        subscriptionStatusSnapshot: "active",
        allowanceMicrocentsSnapshot: 12_000_000n,
        periodStart: period.start,
        periodEnd: period.resetAt,
      },
    });

    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    await expect(
      runWithoutTenant(() =>
        repo.extendUsageReservationUnscoped({
          turnRequestId,
          companyId: fixture.companyId,
          userId: fixture.actorUserId,
          requiredMicrocents: 12_000_000,
        }),
      ),
    ).resolves.toEqual({ disposition: "extended", reservedMicrocents: 12_000_000 });
    await expect(
      runWithoutTenant(() =>
        repo.extendUsageReservationUnscoped({
          turnRequestId,
          companyId: fixture.companyId,
          userId: fixture.actorUserId,
          requiredMicrocents: 12_000_001,
        }),
      ),
    ).resolves.toEqual({ disposition: "credit_limit" });

    const reservations = await db.prisma.agentUsageEvent.findMany({
      where: { companyId: fixture.companyId },
      select: { reservedMicrocents: true },
    });
    expect(reservations).toHaveLength(1);
    expect(reservations.every((row) => row.reservedMicrocents <= 12_000_000n)).toBe(true);
  }, 60_000);

  it("scores a complex case from its final line and the database state", async () => {
    const fixture = await seedBenchmarkCase(db, "C27", `selftest:${randomUUID()}`, 12);
    fixtures.push(fixture);
    const read = { name: "query_crm_records", input: { typeId: presetId(fixture.companyId, "deal") }, outcome: "ok" as const };
    const answer = "Alpha Rollout (20,000 vs 5,000), Gamma Pilot (30,000 vs 12,000), Epsilon Platform (50,000 vs 10,000) and Zeta Support (6,000 vs 0) are below half.\nRESULT deals=4 gapEur=79000";
    const correct = await scoreBenchmarkCase(db, fixture, { turns: [{ text: answer, tools: [read], terminalCode: "completed" }] });
    expect(correct.passed).toBe(true);
    const wrong = await scoreBenchmarkCase(db, fixture, {
      turns: [{ text: answer.replace("79000", "73000"), tools: [read], terminalCode: "completed" }],
    });
    expect(wrong.checks.find((check) => check.id === "gap-79000")?.passed).toBe(false);
  }, 60_000);

  it("scores every scale case from its final line and catches a planted wrong figure", async () => {
    const expected = expectedScaleAnswers();
    const answers: Record<Exclude<ScaleCaseId, "B5">, readonly [string, ...string[]]> = {
      B1: [`RESULT ${expected.B1}`, `RESULT ${expected.B1.replace(/open=\d+/, "open=1")}`],
      B2: [
        `RESULT ${expected.B2}`,
        `RESULT ${expected.B2.split(";").slice(1).join(";")}`,
        `RESULT ${expected.B2.split(";").reverse().join(";")}`,
        `RESULT ${expected.B2};${expected.B2.split(";")[0]}`,
      ],
      B3: [`RESULT ${expected.B3}`, `RESULT ${expected.B3.replace(/aug=\d+/, "aug=1")}`],
      B4: [`${expected.B4.join("\n")}\nRESULT waiting=12`, `${expected.B4.slice(1).join("\n")}\nRESULT waiting=11`],
      A1: [
        `RESULT count=511 medianEur=${expected.A1.median}`,
        `RESULT count=511 medianEur=${expected.A1.median + 100}`,
      ],
      A2: [
        `RESULT ranking=${expected.A2.map((entry) => entry.name).join(";")}`,
        `RESULT ranking=${[expected.A2[1], expected.A2[0], ...expected.A2.slice(2)].map((entry) => entry.name).join(";")}`,
      ],
      A3: [`RESULT count=${expected.A3}`, `RESULT count=${expected.A3 - 14}`],
      A4: [`RESULT duplicateNames=9 surplusRecords=11`, `RESULT duplicateNames=9 surplusRecords=9`],
    };
    for (const [caseId, [correctText, ...wrongTexts]] of Object.entries(answers) as [
      ScaleCaseId,
      readonly [string, ...string[]],
    ][]) {
      const fixture = await seedBenchmarkCase(db, caseId, `selftest:${randomUUID()}`, 12);
      fixtures.push(fixture);
      const read = {
        name: "query_crm_records",
        input: { typeId: presetId(fixture.companyId, "deal") },
        outcome: "ok" as const,
      };
      const correct = await scoreBenchmarkCase(db, fixture, {
        turns: [{ text: correctText, tools: [read], terminalCode: "completed" }],
      });
      expect({ caseId, failed: correct.checks.filter((check) => !check.passed).map((check) => check.id) }).toEqual({
        caseId,
        failed: [],
      });
      for (const wrongText of wrongTexts) {
        const wrong = await scoreBenchmarkCase(db, fixture, {
          turns: [{ text: wrongText, tools: [read], terminalCode: "completed" }],
        });
        expect({ caseId, wrongText, passed: wrong.passed }).toEqual({ caseId, wrongText, passed: false });
      }
    }
  }, 600_000);

  it("counts a widget left on the dashboard as a business-state change", async () => {
    const fixture = await seedBenchmarkCase(db, "B3", `selftest:${randomUUID()}`, 12);
    fixtures.push(fixture);
    expect(fixture.before.widget).toEqual([]);
    const turn = {
      text: `RESULT ${expectedScaleAnswers().B3}`,
      tools: [
        { name: "query_crm_records", input: { typeId: presetId(fixture.companyId, "deal") }, outcome: "ok" as const },
      ],
      terminalCode: "completed",
    };
    const failedChecks = async () =>
      (await scoreBenchmarkCase(db, fixture, { turns: [turn] })).checks
        .filter((check) => !check.passed)
        .map((check) => check.id);

    expect(await failedChecks()).toEqual([]);
    const widget = await db.prisma.widget.create({
      data: { companyId: fixture.companyId, userId: fixture.actorUserId, name: "Deal value by close month" },
    });
    expect(await failedChecks()).toEqual(["business-state-unchanged"]);
    await db.prisma.widget.delete({ where: { id: widget.id } });
    expect(await failedChecks()).toEqual([]);
  }, 60_000);

  it("scores R53 by the one contact widget it adds and nothing else", async () => {
    const fixture = await seedBenchmarkCase(db, "R53", `selftest:${randomUUID()}`, 12);
    fixtures.push(fixture);
    const turn = {
      text: "Added a widget that counts your contacts.",
      tools: [{ name: "manage_widgets", input: { action: "create" }, outcome: "ok" as const }],
      terminalCode: "completed",
    };
    const failedChecks = async (approvalDecisions: ("approve" | "reject")[] = []) =>
      (await scoreBenchmarkCase(db, fixture, { turns: [{ ...turn, approvalDecisions }] })).checks
        .filter((check) => !check.passed)
        .map((check) => check.id);

    expect(await failedChecks()).toEqual(["one-contact-widget-created"]);
    const widget = await db.prisma.widget.create({
      data: {
        companyId: fixture.companyId,
        userId: fixture.actorUserId,
        name: "Contacts",
        measure: { source: { typeId: presetId(fixture.companyId, "contact") } },
      },
    });
    expect(await failedChecks()).toEqual([]);
    expect(await failedChecks(["approve"])).toEqual(["no-approval"]);
    await db.prisma.recordValue.updateMany({
      where: {
        companyId: fixture.companyId,
        typeId: presetId(fixture.companyId, "contact"),
        recordId: fixture.ids["widget-contact"],
        fieldId: presetId(fixture.companyId, "contact.firstName"),
      },
      data: { textValue: "Changed" },
    });
    expect(await failedChecks()).toEqual(["only-widget-table-changed"]);
    await db.prisma.widget.delete({ where: { id: widget.id } });
  }, 60_000);

  it("seeds live Gate C candidates and history, and scores a turn by the records it wrote", async () => {
    const fixture = await seedBenchmarkCase(db, "GC06", `selftest:${randomUUID()}`, 12);
    fixtures.push(fixture);
    expect((fixture.before.deal as { name: string }[]).map((deal) => deal.name).sort()).toEqual([
      "Atlas Renewal Q3",
      "Atlas Renewal Q4",
    ]);
    const turn = {
      text: "Deleted Atlas Renewal Q4.",
      tools: [{ name: "mutate_crm_record", input: { mutation: { action: "update" } }, outcome: "ok" as const }],
      terminalCode: "completed",
    };
    const scored = () => scoreBenchmarkCase(db, fixture, { turns: [turn] });
    const renameDeal = (key: string, name: string) =>
      db.prisma.recordValue.updateMany({
        where: {
          companyId: fixture.companyId,
          typeId: presetId(fixture.companyId, "deal"),
          recordId: fixture.ids[key],
          fieldId: presetId(fixture.companyId, "deal.name"),
        },
        data: { textValue: name },
      });
    expect((await scored()).details).toMatchObject({ written: [], correctWrite: false, wrongRecordWrite: false });
    await renameDeal("atlas-q4", "Atlas Renewal Q4 (removed)");
    expect((await scored()).details).toMatchObject({
      written: ["atlas-q4"],
      correctWrite: true,
      wrongRecordWrite: false,
    });
    expect((await scored()).passed).toBe(true);
    await renameDeal("atlas-q3", "Atlas Renewal Q3 (removed)");
    const wrong = await scored();
    expect(wrong.details).toMatchObject({
      written: ["atlas-q3", "atlas-q4"],
      wrongRecordWrite: true,
      correctWrite: false,
    });
    expect(wrong.checks.filter((check) => !check.passed).map((check) => check.id)).toEqual(["no-wrong-record-write"]);

    const reply = await seedBenchmarkCase(db, "GC08", `selftest:${randomUUID()}`, 12);
    fixtures.push(reply);
    const messages = await runWithoutTenant(() =>
      db.prisma.agentMessage.findMany({
        where: { conversationId: reply.ids["history-conversation"] },
        orderBy: { sequence: "asc" },
      }),
    );
    expect(messages.map((message) => [message.role, (message.parts as { text: string }[])[0]?.text])).toEqual([
      ["user", "Setz Nova auf gewonnen."],
      ["assistant", "Meinst du Nova Expansion oder Nova Expansion 2025?"],
    ]);
  }, 120_000);

  it("scores the clarified follow-up by the deal that changed", async () => {
    const fixture = await seedBenchmarkCase(db, "B5", `selftest:${randomUUID()}`, 12);
    fixtures.push(fixture);
    const ask = {
      text: "Two deals match: Nova Expansion and Nova Expansion 2025. Which one do you mean?",
      tools: [
        {
          name: "query_crm_records",
          input: { typeId: presetId(fixture.companyId, "deal") },
          outcome: "ok" as const,
        },
      ],
      terminalCode: "completed",
    };
    const write = {
      text: "Nova Expansion 2025 is now Won.",
      tools: [
        {
          name: "mutate_crm_record",
          input: { mutation: { action: "update", ref: { typeId: presetId(fixture.companyId, "deal") } } },
          outcome: "ok" as const,
        },
      ],
      terminalCode: "completed",
    };
    const dealValue = (dealKey: string, fieldId: string, data: { textValue?: string; decimalValue?: number }) =>
      db.prisma.recordValue.updateMany({
        where: {
          companyId: fixture.companyId,
          typeId: presetId(fixture.companyId, "deal"),
          recordId: fixture.ids[dealKey],
          fieldId,
        },
        data: { ...data, state: "value" },
      });
    const setStatus = (dealKey: string, option: string) =>
      dealValue(dealKey, fixture.ids["deal-status"], { textValue: fixture.ids[option] });

    const failedChecks = async () =>
      (await scoreBenchmarkCase(db, fixture, { turns: [ask, write] })).checks
        .filter((check) => !check.passed)
        .map((check) => check.id);
    const rename = (dealKey: string, name: string) =>
      dealValue(dealKey, presetId(fixture.companyId, "deal.name"), { textValue: name });

    await setStatus("nova-deal-2025", "option-won");
    expect(await failedChecks()).toEqual([]);

    await rename("nova-deal", "Nova Expansion Renamed");
    expect(await failedChecks()).toEqual(["nothing-else-changed"]);
    await rename("nova-deal", "Nova Expansion");
    await rename("nova-deal-2025", "Nova Expansion 2025 Renamed");
    expect(await failedChecks()).toEqual(["nothing-else-changed"]);
    await rename("nova-deal-2025", "Nova Expansion 2025");
    const referenceKey = {
      companyId: fixture.companyId,
      typeId: presetId(fixture.companyId, "deal"),
      recordId: fixture.ids["nova-deal-2025"],
      fieldId: fixture.ids["deal-reference"],
    };
    const previousReference = await db.prisma.recordValue.findUnique({
      where: { companyId_typeId_recordId_fieldId: referenceKey },
    });
    const schema = await db.prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: fixture.companyId } });
    await db.prisma.recordValue.upsert({
      where: { companyId_typeId_recordId_fieldId: referenceKey },
      create: { ...referenceKey, state: "value", textValue: "REF-2025", schemaRevision: schema.revision },
      update: { state: "value", textValue: "REF-2025" },
    });
    expect(await failedChecks()).toEqual(["nothing-else-changed"]);
    if (previousReference) {
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...restored } = previousReference;
      await db.prisma.recordValue.update({
        where: { companyId_typeId_recordId_fieldId: referenceKey },
        data: { ...restored, decimalValue: restored.decimalValue ?? undefined, jsonValue: restored.jsonValue ?? undefined },
      });
    } else await db.prisma.recordValue.delete({ where: { companyId_typeId_recordId_fieldId: referenceKey } });
    expect(await failedChecks()).toEqual([]);

    await setStatus("nova-deal", "option-won");
    const wrongDeal = await scoreBenchmarkCase(db, fixture, { turns: [ask, write] });
    expect(wrongDeal.checks.find((check) => check.id === "other-deal-still-open")?.passed).toBe(false);
    const guessed = await scoreBenchmarkCase(db, fixture, {
      turns: [{ ...ask, tools: [...ask.tools, write.tools[0]] }, write],
    });
    expect(guessed.checks.find((check) => check.id === "turn-1-changes-nothing")?.passed).toBe(false);
  }, 120_000);
});
