import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

import type { EpisodeArtifact } from "../episode";
import type { JudgeVerdict } from "../judge";

import {
  campaignSpendUsd,
  completeEpisode,
  createCampaign,
  recordCharge,
  recoverInterruptedEpisode,
  registerEpisode,
  updateEpisode,
} from "../campaign";
import {
  JUDGE_MODELS,
  judgeArtifact,
  judgeVerdictIsComplete,
} from "../judge";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("agent benchmark ledger", () => {
  let pool: Pool;
  const campaignIds: string[] = [];
  const productCompanyIds: string[] = [];

  beforeAll(() => {
    if (!databaseUrl) throw new Error("Database URL is required.");
    pool = new Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (campaignIds.length) {
      await pool.query("DELETE FROM local_agent_benchmark.charge WHERE campaign_id = ANY($1::uuid[])", [campaignIds]);
      await pool.query("DELETE FROM local_agent_benchmark.episode WHERE campaign_id = ANY($1::uuid[])", [campaignIds]);
      await pool.query("DELETE FROM local_agent_benchmark.campaign WHERE id = ANY($1::uuid[])", [campaignIds]);
    }
    if (productCompanyIds.length)
      await pool.query('DELETE FROM "Company" WHERE "id" = ANY($1::text[])', [
        productCompanyIds,
      ]);
    await pool.end();
  });

  it.each(["prepared", "running"] as const)(
    "recovers a stranded %s episode, preserves its charge, and leaves the row retryable",
    async (state) => {
      const campaign = await createCampaign(
        pool,
        `recover-${state}-${randomUUID()}`,
        10,
      );
      campaignIds.push(campaign.id);
      const episodeId = await registerEpisode(pool, {
        campaignId: campaign.id,
        arm: "shipped",
        caseId: "S1",
        repetition: 1,
        runtimeVariant: "merge",
        namespace: `recover-${state}-${randomUUID()}`,
        companyId: randomUUID(),
        actorUserId: randomUUID(),
      });
      if (state === "running")
        await updateEpisode(pool, episodeId, "running", null, null);
      await recordCharge(pool, campaign.id, episodeId, "probe", 3.25, false, {
        reserved: true,
      });

      await expect(
        recoverInterruptedEpisode(pool, {
          campaignId: campaign.id,
          arm: "shipped",
          caseId: "S1",
          repetition: 1,
          runtimeVariant: "merge",
        }),
      ).resolves.toEqual({ id: episodeId, previousState: state });

      const recovered = await pool.query<{
        state: string;
        reason: string | null;
        finished_at: Date | null;
      }>(
        "SELECT state, reason, finished_at FROM local_agent_benchmark.episode WHERE id = $1::uuid",
        [episodeId],
      );
      expect(recovered.rows[0]).toMatchObject({
        state: "failed",
        reason: "explicit recovery after interruption",
      });
      expect(recovered.rows[0]?.finished_at).toBeInstanceOf(Date);
      const charges = await pool.query<{
        usd: string;
        measured: boolean;
        detail: { reserved?: boolean };
      }>(
        "SELECT usd::text, measured, detail FROM local_agent_benchmark.charge WHERE episode_id = $1::uuid",
        [episodeId],
      );
      expect(charges.rows).toEqual([
        { usd: "3.25", measured: false, detail: { reserved: true } },
      ]);

      const retried = await registerEpisode(pool, {
        campaignId: campaign.id,
        arm: "shipped",
        caseId: "S1",
        repetition: 1,
        runtimeVariant: "merge",
        namespace: `retry-${state}-${randomUUID()}`,
        companyId: randomUUID(),
        actorUserId: randomUUID(),
      });
      expect(retried).toBe(episodeId);
      expect(
        await pool.query(
          "SELECT 1 FROM local_agent_benchmark.charge WHERE episode_id = $1::uuid",
          [episodeId],
        ),
      ).toMatchObject({ rowCount: 1 });
    },
  );

  it("does not let completion overwrite an explicitly recovered episode", async () => {
    const campaign = await createCampaign(
      pool,
      `recover-complete-race-${randomUUID()}`,
      10,
    );
    campaignIds.push(campaign.id);
    const episodeId = await registerEpisode(pool, {
      campaignId: campaign.id,
      arm: "shipped",
      caseId: "S1",
      repetition: 1,
      runtimeVariant: "merge",
      namespace: `recover-complete-race-${randomUUID()}`,
      companyId: randomUUID(),
      actorUserId: randomUUID(),
    });
    await updateEpisode(pool, episodeId, "running", null, null);
    await recoverInterruptedEpisode(pool, {
      campaignId: campaign.id,
      arm: "shipped",
      caseId: "S1",
      repetition: 1,
      runtimeVariant: "merge",
    });

    await expect(
      completeEpisode(
        pool,
        episodeId,
        "scored",
        null,
        "/tmp/late-evidence.json",
      ),
    ).rejects.toThrow(/no longer eligible for terminal completion/);

    const row = await pool.query<{
      state: string;
      artifact_path: string | null;
    }>(
      "SELECT state, artifact_path FROM local_agent_benchmark.episode WHERE id = $1::uuid",
      [episodeId],
    );
    expect(row.rows[0]).toEqual({ state: "failed", artifact_path: null });
  });

  it("refuses recovery while the fixture actor has a nonterminal turn or any run lease", async () => {
    const campaign = await createCampaign(
      pool,
      `recover-live-${randomUUID()}`,
      10,
    );
    campaignIds.push(campaign.id);
    const companyId = randomUUID();
    const actorUserId = randomUUID();
    const conversationId = randomUUID();
    productCompanyIds.push(companyId);
    await pool.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1::text, CURRENT_TIMESTAMP)',
      [companyId],
    );
    await pool.query(
      `INSERT INTO "User"
         ("id", "email", "firstName", "lastName", "companyId", "updatedAt")
       VALUES ($1::text, $2, 'Recovery', 'Actor', $3::text, CURRENT_TIMESTAMP)`,
      [actorUserId, `${actorUserId}@example.invalid`, companyId],
    );
    await pool.query(
      `INSERT INTO "AgentConversation"
         ("id", "companyId", "userId", "updatedAt")
       VALUES ($1::text, $2::text, $3::text, CURRENT_TIMESTAMP)`,
      [conversationId, companyId, actorUserId],
    );
    const episodeId = await registerEpisode(pool, {
      campaignId: campaign.id,
      arm: "shipped",
      caseId: "S1",
      repetition: 1,
      runtimeVariant: "merge",
      namespace: `recover-live-${randomUUID()}`,
      companyId,
      actorUserId,
    });
    await updateEpisode(pool, episodeId, "running", null, null);
    const turnRequestId = randomUUID();
    await pool.query(
      `INSERT INTO "AgentTurnRequest"
         ("id", "companyId", "userId", "conversationId", "clientRequestId",
          "text", "status", "runId", "userMessageId", "updatedAt")
       VALUES ($1::text, $2::text, $3::text, $4::text, $5::text,
               'recovery guard', 'running', $6::text, $7::text, CURRENT_TIMESTAMP)`,
      [
        turnRequestId,
        companyId,
        actorUserId,
        conversationId,
        randomUUID(),
        randomUUID(),
        randomUUID(),
      ],
    );
    const recover = () =>
      recoverInterruptedEpisode(pool, {
        campaignId: campaign.id,
        arm: "shipped",
        caseId: "S1",
        repetition: 1,
        runtimeVariant: "merge",
      });

    await expect(recover()).rejects.toThrow(/nonterminal agent turn/);
    await pool.query(
      `UPDATE "AgentTurnRequest"
          SET "status" = 'completed', "terminalCode" = 'completed',
              "terminalAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $1::text`,
      [turnRequestId],
    );
    await pool.query(
      `INSERT INTO "AgentRunLease"
         ("conversationId", "companyId", "userId", "runId", "expiresAt")
       VALUES ($1::text, $2::text, $3::text, $4::text, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
      [conversationId, companyId, actorUserId, randomUUID()],
    );

    await expect(recover()).rejects.toThrow(/agent run lease/);
    const state = await pool.query<{ state: string }>(
      "SELECT state FROM local_agent_benchmark.episode WHERE id = $1::uuid",
      [episodeId],
    );
    expect(state.rows[0]?.state).toBe("running");
  });

  it.each(["scored", "skipped"] as const)(
    "refuses to recover %s evidence",
    async (state) => {
      const campaign = await createCampaign(
        pool,
        `recover-${state}-${randomUUID()}`,
        10,
      );
      campaignIds.push(campaign.id);
      const episodeId = await registerEpisode(pool, {
        campaignId: campaign.id,
        arm: "shipped",
        caseId: "S1",
        repetition: 1,
        runtimeVariant: "merge",
        namespace: `recover-${state}-${randomUUID()}`,
        companyId: randomUUID(),
        actorUserId: randomUUID(),
      });
      await updateEpisode(
        pool,
        episodeId,
        state,
        state === "skipped" ? "planted skip" : null,
        state === "scored" ? "/tmp/evidence.json" : null,
      );

      await expect(
        recoverInterruptedEpisode(pool, {
          campaignId: campaign.id,
          arm: "shipped",
          caseId: "S1",
          repetition: 1,
          runtimeVariant: "merge",
        }),
      ).rejects.toThrow(
        `is ${state}; only prepared or running episodes can be recovered`,
      );
      const unchanged = await pool.query<{
        state: string;
        artifact_path: string | null;
      }>(
        "SELECT state, artifact_path FROM local_agent_benchmark.episode WHERE id = $1::uuid",
        [episodeId],
      );
      expect(unchanged.rows[0]).toEqual({
        state,
        artifact_path: state === "scored" ? "/tmp/evidence.json" : null,
      });
    },
  );

  it("reuses one logical episode row when a failed attempt is retried", async () => {
    const campaign = await createCampaign(pool, `retry-${randomUUID()}`, 10);
    campaignIds.push(campaign.id);
    const first = await registerEpisode(pool, {
      campaignId: campaign.id,
      arm: "shipped",
      caseId: "S1",
      repetition: 1,
      runtimeVariant: "merge",
      namespace: `first-${randomUUID()}`,
      companyId: randomUUID(),
      actorUserId: randomUUID(),
    });
    await updateEpisode(pool, first, "failed", "planted", null);
    const secondNamespace = `second-${randomUUID()}`;
    const second = await registerEpisode(pool, {
      campaignId: campaign.id,
      arm: "shipped",
      caseId: "S1",
      repetition: 1,
      runtimeVariant: "merge",
      namespace: secondNamespace,
      companyId: randomUUID(),
      actorUserId: randomUUID(),
    });

    expect(second).toBe(first);
    const rows = await pool.query<{
      id: string;
      namespace: string;
      state: string;
    }>("SELECT id::text, namespace, state FROM local_agent_benchmark.episode WHERE campaign_id = $1::uuid", [
      campaign.id,
    ]);
    expect(rows.rows).toEqual([{ id: first, namespace: secondNamespace, state: "prepared" }]);
  });

  it("settles failed judge reservations to the measured response cost", async () => {
    const campaign = await createCampaign(pool, `judge-${randomUUID()}`, 100);
    campaignIds.push(campaign.id);
    const episodeId = await registerEpisode(pool, {
      campaignId: campaign.id,
      arm: "shipped",
      caseId: "S1",
      repetition: 1,
      runtimeVariant: "merge",
      namespace: `judge-${randomUUID()}`,
      companyId: randomUUID(),
      actorUserId: randomUUID(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            choices: [{ message: { content: "not valid judge json" } }],
            usage: { prompt_tokens: 100, completion_tokens: 20 },
          }),
        ),
      ),
    );
    const artifact = {
      campaignId: campaign.id,
      episodeId,
      caseId: "S1",
      repetition: 1,
      title: "case",
      prompts: ["question"],
      judgeFacts: [],
      observed: [{ text: "answer", tools: [], terminalCode: "completed" }],
    } as unknown as EpisodeArtifact;

    await expect(judgeArtifact(pool, "test-key", artifact)).rejects.toThrow(/no judge answered/);

    const charges = await pool.query<{
      usd: string;
      measured: boolean;
      detail: { failed?: boolean };
    }>(
      "SELECT usd::text, measured, detail FROM local_agent_benchmark.charge WHERE campaign_id = $1::uuid AND kind = 'judge' ORDER BY created_at",
      [campaign.id],
    );
    expect(charges.rows).toHaveLength(2);
    expect(charges.rows.every((row) => row.measured && row.detail.failed)).toBe(true);
    expect(await campaignSpendUsd(pool, campaign.id)).toBeLessThan(1);
  });

  it("settles provably zero-cost judge rejections to zero", async () => {
    const campaign = await createCampaign(pool, `judge-rejected-${randomUUID()}`, 100);
    campaignIds.push(campaign.id);
    const episodeId = await registerEpisode(pool, {
      campaignId: campaign.id,
      arm: "shipped",
      caseId: "S1",
      repetition: 1,
      runtimeVariant: "merge",
      namespace: `judge-rejected-${randomUUID()}`,
      companyId: randomUUID(),
      actorUserId: randomUUID(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({ error: "payment required" }, { status: 402 }),
        ),
      ),
    );
    const artifact = {
      campaignId: campaign.id,
      episodeId,
      caseId: "S1",
      repetition: 1,
      title: "case",
      prompts: ["question"],
      judgeFacts: [],
      observed: [{ text: "answer", tools: [], terminalCode: "completed" }],
    } as unknown as EpisodeArtifact;

    await expect(judgeArtifact(pool, "test-key", artifact)).rejects.toThrow(
      /no judge answered/,
    );

    const charges = await pool.query<{
      usd: string;
      measured: boolean;
      detail: { failed?: boolean };
    }>(
      "SELECT usd::text, measured, detail FROM local_agent_benchmark.charge WHERE campaign_id = $1::uuid AND kind = 'judge' ORDER BY created_at",
      [campaign.id],
    );
    expect(charges.rows).toHaveLength(2);
    expect(
      charges.rows.every(
        (row) => row.measured && Number(row.usd) === 0 && row.detail.failed,
      ),
    ).toBe(true);
    expect(await campaignSpendUsd(pool, campaign.id)).toBe(0);
  });

  it("retains worst-case reservations when judge cost is uncertain", async () => {
    const campaign = await createCampaign(pool, `judge-uncertain-${randomUUID()}`, 100);
    campaignIds.push(campaign.id);
    const episodeId = await registerEpisode(pool, {
      campaignId: campaign.id,
      arm: "shipped",
      caseId: "S1",
      repetition: 1,
      runtimeVariant: "merge",
      namespace: `judge-uncertain-${randomUUID()}`,
      companyId: randomUUID(),
      actorUserId: randomUUID(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("network disconnected"))),
    );
    const artifact = {
      campaignId: campaign.id,
      episodeId,
      caseId: "S1",
      repetition: 1,
      title: "case",
      prompts: ["question"],
      judgeFacts: [],
      observed: [{ text: "answer", tools: [], terminalCode: "completed" }],
    } as unknown as EpisodeArtifact;

    await expect(judgeArtifact(pool, "test-key", artifact)).rejects.toThrow(
      /no judge answered/,
    );

    const charges = await pool.query<{
      usd: string;
      measured: boolean;
      detail: { reserved?: boolean };
    }>(
      "SELECT usd::text, measured, detail FROM local_agent_benchmark.charge WHERE campaign_id = $1::uuid AND kind = 'judge' ORDER BY created_at",
      [campaign.id],
    );
    expect(charges.rows).toHaveLength(2);
    expect(
      charges.rows.every(
        (row) =>
          !row.measured && Number(row.usd) > 0 && row.detail.reserved === true,
      ),
    ).toBe(true);
    expect(await campaignSpendUsd(pool, campaign.id)).toBeGreaterThan(0);
  });

  it("persists partial judge progress so a retry does not repay a successful judge", async () => {
    const campaign = await createCampaign(pool, `judge-partial-${randomUUID()}`, 100);
    campaignIds.push(campaign.id);
    const episodeId = await registerEpisode(pool, {
      campaignId: campaign.id,
      arm: "shipped",
      caseId: "S1",
      repetition: 1,
      runtimeVariant: "merge",
      namespace: `judge-partial-${randomUUID()}`,
      companyId: randomUUID(),
      actorUserId: randomUUID(),
    });
    const valid = {
      choices: [
        {
          message: {
            content:
              '{"grounding":5,"completeness":5,"reasoning":5,"actionability":5,"fabricationFree":5,"rationale":"Grounded and complete."}',
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(valid))
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ message: { content: "invalid" } }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
      )
      .mockResolvedValueOnce(Response.json(valid));
    vi.stubGlobal("fetch", fetchMock);
    const artifact = {
      campaignId: campaign.id,
      episodeId,
      caseId: "S1",
      repetition: 1,
      title: "case",
      prompts: ["question"],
      judgeFacts: [],
      observed: [{ text: "answer", tools: [], terminalCode: "completed" }],
    } as unknown as EpisodeArtifact;

    const checkpoints: JudgeVerdict[] = [];
    artifact.judge = await judgeArtifact(
      pool,
      "test-key",
      artifact,
      async (progress) => {
        checkpoints.push(structuredClone(progress));
        if (
          progress.judges.length === 1 &&
          (progress.unavailable?.length ?? 0) === 0
        ) {
          const charges = await pool.query<{
            measured: boolean;
            detail: { reserved?: boolean };
          }>(
            "SELECT measured, detail FROM local_agent_benchmark.charge WHERE campaign_id = $1::uuid AND kind = 'judge' ORDER BY created_at",
            [campaign.id],
          );
          expect(charges.rows).toEqual([
            expect.objectContaining({
              measured: false,
              detail: expect.objectContaining({ reserved: true }),
            }),
          ]);
        }
      },
    );
    expect(artifact.judge.judges).toHaveLength(1);
    expect(judgeVerdictIsComplete(artifact.judge)).toBe(false);
    expect(checkpoints[0]?.judges).toHaveLength(1);
    expect(checkpoints.at(-1)?.unavailable).toEqual([JUDGE_MODELS[1].id]);
    artifact.judge = await judgeArtifact(pool, "test-key", artifact);

    expect(judgeVerdictIsComplete(artifact.judge)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
