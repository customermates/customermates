import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { ForbiddenError } from "@/core/errors/app-errors";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { EventService } from "@/features/event/event.service";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));

import { ApproveWikiPageProposalInteractor } from "../approve-wiki-page-proposal.interactor";
import { CreateWikiPagesInteractor } from "../create-wiki-pages.interactor";
import { DeleteWikiPageInteractor } from "../delete-wiki-page.interactor";
import { GetWikiPageProposalsInteractor } from "../get-wiki-page-proposals.interactor";
import { PrismaWikiPageProposalRepo } from "../prisma-wiki-page-proposal.repository";
import { PrismaWikiPageRepo } from "../prisma-wiki-page.repository";
import { ProposeWikiPageChangesInteractor } from "../propose-wiki-page-changes.interactor";
import { RejectWikiPageProposalInteractor } from "../reject-wiki-page-proposal.interactor";
import { UpdateWikiPageInteractor } from "../update-wiki-page.interactor";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function errorCode(result: unknown): unknown {
  if (!result || typeof result !== "object" || (result as { ok?: unknown }).ok !== false) return null;
  const issue = (result as { error?: { issues?: Array<{ params?: { error?: unknown } }> } }).error?.issues?.[0];
  return issue?.params?.error ?? null;
}

function data<T>(result: { ok: true; data: T } | { ok: false }): T {
  if (!result.ok) throw new Error(`Expected success, got ${JSON.stringify(result)}`);
  return result.data;
}

describeDatabase("Knowledge Base proposals on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const ownerId = randomUUID();
  const routineId = randomUUID();
  const runId = randomUUID();
  const conversationId = randomUUID();
  const owner: TenantUser = createMockUser({ id: ownerId, companyId });
  const admin: TenantUser = createMockUser({ id: randomUUID(), companyId });
  const editor: TenantUser = {
    ...createMockUserWithPermissions([
      { resource: Resource.wiki, action: Action.readAll },
      { resource: Resource.wiki, action: Action.update },
    ]),
    id: randomUUID(),
    companyId,
  };
  const reader: TenantUser = {
    ...createMockUserWithPermissions([{ resource: Resource.wiki, action: Action.readAll }]),
    id: randomUUID(),
    companyId,
  };
  const foreignAdmin: TenantUser = createMockUser({ id: randomUUID(), companyId: foreignCompanyId });

  const eventService = () =>
    new EventService(
      [],
      { getWebhooksForEvent: () => Promise.resolve([]), getWebhooksForEventUnscoped: () => Promise.resolve([]) },
      { create: () => Promise.resolve([]), createUnscoped: () => Promise.resolve([]) },
      { log: () => Promise.resolve(), logUnscoped: () => Promise.resolve() },
      { dispatch: () => Promise.resolve() } as never,
      {
        findEventRoutinesUnscoped: () => Promise.resolve([]),
        admitEventRoutineRunsUnscoped: () => Promise.resolve([]),
      },
      {
        matchesCurrentUser: () => Promise.resolve(true),
        matchesUserUnscoped: () => Promise.resolve(true),
        canUserAccessUnscoped: () => Promise.resolve(true),
      },
    );
  const pages = () => new PrismaWikiPageRepo();
  const proposals = () => new PrismaWikiPageProposalRepo();
  const createPage = async (title: string, markdown: string, tenant = admin) => {
    const created = await runWithTenant(tenant, () =>
      new CreateWikiPagesInteractor(pages(), eventService()).invoke({
        pages: [{ title, markdown }],
        requireEmpty: false,
      }),
    );
    return data(created)[0];
  };
  const updatePage = (input: Parameters<UpdateWikiPageInteractor["invoke"]>[0]) =>
    runWithTenant(admin, () => new UpdateWikiPageInteractor(pages(), eventService()).invoke(input));
  const propose = (input: Parameters<ProposeWikiPageChangesInteractor["invoke"]>[0], tenant = owner) =>
    runWithTenant(tenant, () => new ProposeWikiPageChangesInteractor(proposals()).invoke(input));
  const list = (tenant: TenantUser) =>
    runWithTenant(tenant, () => new GetWikiPageProposalsInteractor(proposals()).invoke());
  const approve = (id: string, tenant: TenantUser) =>
    runWithTenant(tenant, () =>
      new ApproveWikiPageProposalInteractor(
        proposals(),
        new CreateWikiPagesInteractor(pages(), eventService()),
        new UpdateWikiPageInteractor(pages(), eventService()),
        new DeleteWikiPageInteractor(pages(), eventService()),
      ).invoke({ id }),
    );
  const reject = (id: string, tenant: TenantUser) =>
    runWithTenant(tenant, () => new RejectWikiPageProposalInteractor(proposals()).invoke({ id }));
  const storedPage = async (id: string) =>
    (await client.query('SELECT "title", "markdown" FROM "WikiPage" WHERE "id" = $1', [id])).rows[0] ?? null;
  const storedProposal = async (id: string) =>
    (
      await client.query('SELECT "status", "reviewedByUserId", "pageId" FROM "WikiPageProposal" WHERE "id" = $1', [
        id,
      ])
    ).rows[0];

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [ownerId, `${ownerId}@example.com`, "Routine", "Owner", companyId],
    );
    await client.query(
      `INSERT INTO "Routine" ("id", "companyId", "ownerUserId", "name", "prompt", "triggerKind", "updatedAt")
       VALUES ($1, $2, $3, 'Weekly FAQ refresh', 'Keep the FAQ current.', 'schedule'::"RoutineTriggerKind", CURRENT_TIMESTAMP)`,
      [routineId, companyId, ownerId],
    );
    await client.query(
      `INSERT INTO "AgentConversation" ("id", "companyId", "userId", "origin", "updatedAt")
       VALUES ($1, $2, $3, 'routine', CURRENT_TIMESTAMP)`,
      [conversationId, companyId, ownerId],
    );
    await client.query(
      `INSERT INTO "RoutineRun"
         ("id", "companyId", "routineId", "executedByUserId", "executedByName", "conversationId", "status",
          "triggerKind", "scheduledFor", "updatedAt")
       VALUES ($1, $2, $3, $4, 'Routine Owner', $5, 'running'::"RoutineRunStatus", 'schedule'::"RoutineTriggerKind",
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [runId, companyId, routineId, ownerId, conversationId],
    );
  });

  beforeEach(async () => {
    await client.query('DELETE FROM "WikiPageProposal" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
  });

  afterAll(async () => {
    await client.query('DELETE FROM "WikiPageProposal" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "RoutineRun" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "AgentConversation" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Routine" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("stores routine writes as pending proposals tied to their run and leaves every page untouched", async () => {
    const page = await createPage("Refunds", "Refund within 14 days.");

    const update = data(
      await propose({
        action: "update",
        conversationId,
        id: page.id,
        expectedUpdatedAt: page.updatedAt,
        markdown: "Refund within 30 days.",
      }),
    );
    const removal = await propose({
      action: "delete",
      conversationId,
      id: page.id,
      expectedUpdatedAt: page.updatedAt,
    });
    const creation = data(
      await propose({
        action: "create",
        conversationId,
        pages: [
          { title: "Shipping", markdown: "Ships in two days." },
          { title: "Returns", markdown: "Returns take a week." },
        ],
      }),
    );

    expect(update).toEqual([
      expect.objectContaining({
        action: "update",
        status: "pending",
        pageId: page.id,
        markdown: "Refund within 30 days.",
        title: null,
        baseUpdatedAt: page.updatedAt,
        routineId,
        routineName: "Weekly FAQ refresh",
        routineRunId: runId,
        conversationId,
      }),
    ]);
    expect(removal).toMatchObject({ ok: true, data: [{ action: "delete", pageId: page.id }] });
    expect(creation.map(({ action, title, pageId }) => ({ action, title, pageId }))).toEqual([
      { action: "create", title: "Shipping", pageId: null },
      { action: "create", title: "Returns", pageId: null },
    ]);
    expect(await storedPage(page.id)).toEqual({ title: "Refunds", markdown: "Refund within 14 days." });
    const pageCount = await client.query('SELECT count(*)::int AS count FROM "WikiPage" WHERE "companyId" = $1', [
      companyId,
    ]);
    expect(pageCount.rows[0].count).toBe(1);
  });

  it("supersedes an older pending proposal when a newer one targets the same page", async () => {
    const page = await createPage("Pricing", "Plans start at 29 EUR.");
    const other = await createPage("Support hours", "Weekdays 9 to 5.");
    const first = data(
      await propose({
        action: "update",
        conversationId,
        id: page.id,
        expectedUpdatedAt: page.updatedAt,
        markdown: "Plans start at 39 EUR.",
      }),
    )[0];
    const untouched = data(
      await propose({
        action: "update",
        conversationId,
        id: other.id,
        expectedUpdatedAt: other.updatedAt,
        title: "Opening hours",
      }),
    )[0];
    const second = data(
      await propose({ action: "delete", conversationId, id: page.id, expectedUpdatedAt: page.updatedAt }),
    )[0];

    expect((await storedProposal(first.id)).status).toBe("superseded");
    expect((await storedProposal(second.id)).status).toBe("pending");
    expect((await storedProposal(untouched.id)).status).toBe("pending");
    const pending = data(await list(admin));
    expect(pending.total).toBe(2);
    expect(pending.items.map(({ id }) => id).toSorted()).toEqual([second.id, untouched.id].toSorted());
    expect(pending.items.find(({ id }) => id === second.id)).toMatchObject({
      currentPage: { id: page.id, title: "Pricing" },
      stale: false,
    });
  });

  it("refuses a proposal built on an outdated read so the routine re-reads first", async () => {
    const page = await createPage("Voice", "Friendly.");
    const outdated = new Date(page.updatedAt.getTime() - 1_000);

    const result = await propose({
      action: "update",
      conversationId,
      id: page.id,
      expectedUpdatedAt: outdated,
      markdown: "Formal.",
    });

    expect(errorCode(result)).toBe(CustomErrorCode.wikiPageConflict);
    const count = await client.query('SELECT count(*)::int AS count FROM "WikiPageProposal" WHERE "companyId" = $1', [
      companyId,
    ]);
    expect(count.rows[0].count).toBe(0);
  });

  it("applies an approved update through the page interactor as the reviewer", async () => {
    const page = await createPage("Escalation", "Call the lead.");
    const proposal = data(
      await propose({
        action: "update",
        conversationId,
        id: page.id,
        expectedUpdatedAt: page.updatedAt,
        title: "Escalation path",
        markdown: "Email the lead, then call.",
      }),
    )[0];

    const approved = await approve(proposal.id, editor);

    expect(approved).toMatchObject({ ok: true, data: { id: proposal.id, status: "approved", pageId: page.id } });
    expect(await storedPage(page.id)).toEqual({ title: "Escalation path", markdown: "Email the lead, then call." });
    expect(await storedProposal(proposal.id)).toMatchObject({ status: "approved", reviewedByUserId: editor.id });
    expect(data(await list(admin)).total).toBe(0);
  });

  it("creates the page for an approved create proposal and records its id", async () => {
    const proposal = data(
      await propose({ action: "create", conversationId, pages: [{ title: "Onboarding", markdown: "Day one." }] }),
    )[0];

    const approved = data(await approve(proposal.id, admin));

    expect(approved.pageId).toEqual(expect.any(String));
    expect(await storedPage(approved.pageId as string)).toEqual({ title: "Onboarding", markdown: "Day one." });
  });

  it("checks the reviewer's own permission for the proposed action", async () => {
    const page = await createPage("Legacy", "Old process.");
    const proposal = data(
      await propose({ action: "delete", conversationId, id: page.id, expectedUpdatedAt: page.updatedAt }),
    )[0];

    expect(errorCode(await approve(proposal.id, editor))).toBe(CustomErrorCode.permissionDenied);
    expect(await storedPage(page.id)).not.toBeNull();
    expect((await storedProposal(proposal.id)).status).toBe("pending");

    await expect(approve(proposal.id, reader)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reject(proposal.id, reader)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(list(reader)).rejects.toBeInstanceOf(ForbiddenError);

    expect(data(await approve(proposal.id, admin))).toMatchObject({ status: "approved" });
    expect(await storedPage(page.id)).toBeNull();
  });

  it("fails a stale proposal clearly and keeps it pending without touching the page", async () => {
    const page = await createPage("Hours", "Open 9 to 5.");
    const proposal = data(
      await propose({
        action: "update",
        conversationId,
        id: page.id,
        expectedUpdatedAt: page.updatedAt,
        markdown: "Open 8 to 6.",
      }),
    )[0];
    expect(data(await updatePage({ id: page.id, expectedUpdatedAt: page.updatedAt, markdown: "Open 10 to 4." })));

    expect(data(await list(admin)).items[0]).toMatchObject({ id: proposal.id, stale: true });
    const result = await approve(proposal.id, admin);

    expect(errorCode(result)).toBe(CustomErrorCode.wikiProposalStale);
    expect(await storedPage(page.id)).toEqual({ title: "Hours", markdown: "Open 10 to 4." });
    expect((await storedProposal(proposal.id)).status).toBe("pending");
  });

  it("rejects a proposal once, without changing the page", async () => {
    const page = await createPage("Tone", "Warm.");
    const proposal = data(
      await propose({
        action: "update",
        conversationId,
        id: page.id,
        expectedUpdatedAt: page.updatedAt,
        markdown: "Cold.",
      }),
    )[0];

    expect(await reject(proposal.id, editor)).toMatchObject({ ok: true, data: { status: "rejected" } });
    expect(await storedProposal(proposal.id)).toMatchObject({ status: "rejected", reviewedByUserId: editor.id });
    expect(errorCode(await approve(proposal.id, admin))).toBe(CustomErrorCode.wikiProposalReviewed);
    expect(errorCode(await reject(proposal.id, admin))).toBe(CustomErrorCode.wikiProposalReviewed);
    expect(await storedPage(page.id)).toEqual({ title: "Tone", markdown: "Warm." });
  });

  it("keeps proposals inside their company", async () => {
    const page = await createPage("Internal", "Private.");
    const proposal = data(
      await propose({
        action: "update",
        conversationId,
        id: page.id,
        expectedUpdatedAt: page.updatedAt,
        markdown: "Leaked.",
      }),
    )[0];

    expect(data(await list(foreignAdmin))).toEqual({ items: [], total: 0 });
    expect(errorCode(await approve(proposal.id, foreignAdmin))).toBe(CustomErrorCode.wikiProposalNotFound);
    expect(errorCode(await reject(proposal.id, foreignAdmin))).toBe(CustomErrorCode.wikiProposalNotFound);
    expect(
      errorCode(
        await propose(
          { action: "delete", conversationId, id: page.id, expectedUpdatedAt: page.updatedAt },
          foreignAdmin,
        ),
      ),
    ).toBe(CustomErrorCode.wikiPageNotFound);
    expect((await storedProposal(proposal.id)).status).toBe("pending");
  });
});
