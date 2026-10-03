import type { WikiCrawlStatus } from "../wiki-website-crawl.service";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaWikiPageRepo } from "@/features/wiki/prisma-wiki-page.repository";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

import { PrismaWikiWebsiteCrawlRepo } from "../prisma-wiki-website-crawl.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("Website import cleanup with an unavailable owner", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const repo = () => new PrismaWikiWebsiteCrawlRepo(new PrismaWikiPageRepo());

  const createCrawl = async (status: WikiCrawlStatus, workflowRunId: string | null) => {
    const id = randomUUID();
    await client.query(
      `INSERT INTO "WikiWebsiteCrawl" ("id","companyId","userId","clientRequestId","homepageUrl","registrableDomain","locale","mode","status","extraHosts","pendingHosts","workflowRunId","updatedAt") VALUES ($1,$2,$3,$4,'https://example.com/','example.com','en','initial',$5::"WikiWebsiteCrawlStatus",ARRAY[]::text[],ARRAY[]::text[],$6,now())`,
      [id, companyId, ownerId, randomUUID(), status, workflowRunId],
    );
    return id;
  };
  const getCrawl = async (id: string) =>
    (await client.query('SELECT "status","failureReason","finishedAt" FROM "WikiWebsiteCrawl" WHERE "id"=$1', [id]))
      .rows[0];

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id","updatedAt") VALUES ($1,now())', [companyId]);
  });
  beforeEach(async () => {
    await client.query('DELETE FROM "WikiWebsiteCrawl" WHERE "companyId"=$1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId"=$1', [companyId]);
    await client.query(
      `INSERT INTO "User" ("id","email","firstName","lastName","companyId","updatedAt") VALUES ($1,$2,'Crawl','Owner',$3,now())`,
      [ownerId, `crawl-owner-${ownerId}@example.test`, companyId],
    );
  });
  afterAll(async () => {
    try {
      await client.query('DELETE FROM "Company" WHERE "id"=$1', [companyId]);
    } finally {
      await client.end();
    }
  });

  it.each([
    ["inactive", "queued", null],
    ["inactive", "fetching", "run-owner"],
    ["deleted", "queued", null],
    ["deleted", "fetching", "run-owner"],
  ] as const)(
    "cleans a %s owner's %s crawl outside a tenant and releases the company import slot",
    async (ownerState, status, workflowRunId) => {
      const crawlId = await createCrawl(status, workflowRunId);
      if (ownerState === "inactive")
        await client.query(`UPDATE "User" SET "status"='inactive' WHERE "id"=$1`, [ownerId]);
      else await client.query('DELETE FROM "User" WHERE "id"=$1', [ownerId]);
      await repo().failWorkflowUnscoped({ crawlId, userId: ownerId, workflowRunId: "run-owner" });
      expect(await getCrawl(crawlId)).toEqual({
        status: "failed",
        failureReason: "error",
        finishedAt: expect.any(Date),
      });
      const nextCrawlId = await createCrawl("queued", null);
      expect(await getCrawl(nextCrawlId)).toEqual({ status: "queued", failureReason: null, finishedAt: null });
    },
  );

  it("keeps the immutable owner and workflow identity guards on unscoped cleanup", async () => {
    const crawlId = await createCrawl("fetching", "run-owner");
    await repo().failWorkflowUnscoped({ crawlId, userId: randomUUID(), workflowRunId: "run-owner" });
    await repo().failWorkflowUnscoped({ crawlId, userId: ownerId, workflowRunId: "run-other" });
    expect(await getCrawl(crawlId)).toEqual({ status: "fetching", failureReason: null, finishedAt: null });
  });

  it.each(["completed", "failed", "blocked"] as const)("never overwrites a %s result", async (status) => {
    const crawlId = await createCrawl(status, "run-owner");
    await repo().failWorkflowUnscoped({ crawlId, userId: ownerId, workflowRunId: "run-owner" });
    expect(await getCrawl(crawlId)).toEqual({ status, failureReason: null, finishedAt: null });
  });
});
