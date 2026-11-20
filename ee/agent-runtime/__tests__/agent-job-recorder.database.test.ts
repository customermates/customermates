import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { PrismaAgentJobRepo } from "@/features/agent-jobs/prisma-agent-job.repository";
import {
  AGENT_JOB_SUMMARY_MAX_CHARS,
  AGENT_JOB_TRANSCRIPT_MAX_EVENTS,
  AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS,
} from "@/features/agent-jobs/agent-job.schema";
import { clipText } from "@/features/agent-jobs/agent-job-text";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import { AgentJobRecorder } from "../agent-job-recorder";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const EMOJI = "\u{1F600}";

function onTheCut(max: number): string {
  return `${"a".repeat(max - 1)}${EMOJI} and more`;
}

describeDatabase("transcript of a hosted agent job", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const repo = () => new PrismaAgentJobRepo();

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt")
       VALUES ($1, $2, 'Agent', 'Owner', $3, 'active'::"Status", CURRENT_TIMESTAMP)`,
      [ownerId, `agent-${ownerId}@example.invalid`, companyId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "AgentJob" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("stores events and a result whose text was cut inside an emoji or carries NUL and lone surrogates", async () => {
    const now = new Date("2026-11-17T12:00:00.000Z");
    const prompt = onTheCut(AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS);
    const job = await runWithTenant(createMockUser({ id: ownerId, companyId }), () =>
      repo().enqueue({
        runtime: "ownKey",
        sourceKind: "automation",
        sourceId: randomUUID(),
        idempotencyKey: null,
        ruleChain: [],
        ownerUserId: ownerId,
        prompt,
        promptUntrusted: false,
        model: null,
        pinnedRunnerId: null,
      }),
    );
    const confirmBy = new Date(now.getTime() + 60_000);
    await repo().claimUnscoped({ companyId, runtime: "ownKey", jobId: job.id, now, timeoutAt: confirmBy });
    await repo().startUnscoped({ id: job.id, companyId, attempt: 1, now, timeoutAt: now });

    const recorder = new AgentJobRecorder(() => now);
    recorder.message("user", prompt);
    recorder.toolCall("call-1", "search_crm_records", { query: onTheCut(AGENT_JOB_SUMMARY_MAX_CHARS - 11) });
    recorder.toolResult("call-1", "search_crm_records", true, onTheCut(AGENT_JOB_SUMMARY_MAX_CHARS - 1));
    recorder.toolResult("call-2", "search_crm_records", true, `nul\u0000 and ${EMOJI[0]} alone`);
    recorder.finish("stop", onTheCut(AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS));
    const events = recorder.drain();

    expect(
      await repo().appendEventsUnscoped({
        id: job.id,
        companyId,
        attempt: 1,
        events,
        maxEvents: AGENT_JOB_TRANSCRIPT_MAX_EVENTS,
      }),
    ).toBe(true);
    expect(
      await repo().finishUnscoped({
        id: job.id,
        companyId,
        attempt: 1,
        status: "succeeded",
        result: {
          text: clipText(onTheCut(AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS), AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS),
          reason: "stop",
          toolCalls: 2,
        },
        error: null,
        inputTokens: null,
        outputTokens: null,
        costMicrocents: null,
        now,
      }),
    ).toBe(true);

    const stored = await repo().findUnscoped(companyId, job.id);
    const whole = "a".repeat(AGENT_JOB_TRANSCRIPT_TEXT_MAX_CHARS - 1);
    expect(stored?.transcript).toEqual(events);
    expect(stored?.transcript).toMatchObject([
      { type: "message", text: whole },
      { type: "toolCall" },
      { type: "toolResult", summary: `${"a".repeat(AGENT_JOB_SUMMARY_MAX_CHARS - 2)}…` },
      { type: "toolResult", summary: "nul and � alone" },
      { type: "finish", text: whole },
    ]);
    expect(stored?.result).toMatchObject({ text: whole });
  });
});
