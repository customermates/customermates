import type { TenantUser } from "@/features/user/user.schema";
import type { WikiPageKind } from "../wiki.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { EventService } from "@/features/event/event.service";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));

import { CreateWikiPagesInteractor } from "../create-wiki-pages.interactor";
import { GetWikiPagesInteractor } from "../get-wiki-pages.interactor";
import { PrismaWikiPageRepo } from "../prisma-wiki-page.repository";
import { UpdateWikiPageInteractor } from "../update-wiki-page.interactor";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type PageInput = { title: string; markdown: string; kind?: WikiPageKind; whenToUse?: string; draft?: boolean };

const STEPS = "1. Confirm the order.\n2. Refund within five days.";

function errorCode(result: unknown): unknown {
  if (!result || typeof result !== "object" || (result as { ok?: unknown }).ok !== false) return null;
  const issue = (result as { error?: { issues?: Array<{ params?: { error?: unknown } }> } }).error?.issues?.[0];
  return issue?.params?.error ?? null;
}

describeDatabase("Workspace Wiki page kinds on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const user: TenantUser = createMockUser({ id: randomUUID(), companyId });
  const foreignUser: TenantUser = createMockUser({ id: randomUUID(), companyId: foreignCompanyId });

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
  const create = (pages: PageInput[], tenant = user) =>
    runWithTenant(tenant, () =>
      new CreateWikiPagesInteractor(new PrismaWikiPageRepo(), eventService()).invoke({ pages, requireEmpty: false }),
    );
  const update = (data: Parameters<UpdateWikiPageInteractor["invoke"]>[0]) =>
    runWithTenant(user, () => new UpdateWikiPageInteractor(new PrismaWikiPageRepo(), eventService()).invoke(data));

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
  });

  beforeEach(async () => {
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
  });

  afterAll(async () => {
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("stores ordinary pages as published knowledge and keeps when-to-use only on procedures", async () => {
    const result = await create([
      { title: "Pricing", markdown: "Plans start at 29 EUR." },
      { title: "Refunds", markdown: STEPS, kind: "procedure", whenToUse: "Use when a customer asks for money back." },
    ]);
    if (!result.ok) throw new Error("create failed");
    expect(result.data.map(({ title, kind, whenToUse, draft }) => ({ title, kind, whenToUse, draft }))).toEqual([
      { title: "Pricing", kind: "knowledge", whenToUse: null, draft: false },
      { title: "Refunds", kind: "procedure", whenToUse: "Use when a customer asks for money back.", draft: false },
    ]);

    const [pricing] = result.data;
    const changed = await update({
      id: pricing.id,
      expectedUpdatedAt: pricing.updatedAt,
      whenToUse: "Ignored because this is knowledge.",
      draft: true,
    });
    expect(changed).toMatchObject({ ok: true, data: { kind: "knowledge", whenToUse: null, draft: true } });
  });

  it("requires a trigger and numbered steps for procedures", async () => {
    expect(errorCode(await create([{ title: "Refunds", markdown: STEPS, kind: "procedure" }]))).toBe(
      CustomErrorCode.wikiWhenToUseRequired,
    );
    expect(
      errorCode(
        await create([{ title: "Refunds", markdown: "Refund quickly.", kind: "procedure", whenToUse: "Refund asks." }]),
      ),
    ).toBe(CustomErrorCode.wikiProcedureNeedsSteps);

    const created = await create([{ title: "Refunds", markdown: "Refund quickly." }]);
    if (!created.ok) throw new Error("create failed");
    const [page] = created.data;
    expect(
      errorCode(
        await update({ id: page.id, expectedUpdatedAt: page.updatedAt, kind: "procedure", whenToUse: "Refunds." }),
      ),
    ).toBe(CustomErrorCode.wikiProcedureNeedsSteps);
    expect(
      await update({
        id: page.id,
        expectedUpdatedAt: page.updatedAt,
        kind: "procedure",
        whenToUse: "Refunds.",
        markdown: STEPS,
      }),
    ).toMatchObject({ ok: true, data: { kind: "procedure", whenToUse: "Refunds." } });
  });

  it("allows one Operating Guide per workspace and filters lists by kind", async () => {
    const guide = await create([{ title: "Operating Guide", markdown: "Be concise.", kind: "guide" }]);
    if (!guide.ok) throw new Error("create failed");
    expect(errorCode(await create([{ title: "Second guide", markdown: "Be loud.", kind: "guide" }]))).toBe(
      CustomErrorCode.wikiGuideExists,
    );
    expect(
      errorCode(
        await create([
          { title: "A", markdown: "a", kind: "guide" },
          { title: "B", markdown: "b", kind: "guide" },
        ]),
      ),
    ).toBe(CustomErrorCode.wikiGuideExists);
    expect(await create([{ title: "Foreign guide", markdown: "Hi.", kind: "guide" }], foreignUser)).toMatchObject({
      ok: true,
    });

    const other = await create([{ title: "Tone", markdown: "Warm." }]);
    if (!other.ok) throw new Error("create failed");
    const [tone] = other.data;
    expect(errorCode(await update({ id: tone.id, expectedUpdatedAt: tone.updatedAt, kind: "guide" }))).toBe(
      CustomErrorCode.wikiGuideExists,
    );
    await expect(
      client.query(
        'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "kind", "updatedAt") VALUES ($1, $2, $3, $4, $5, now())',
        [randomUUID(), companyId, "Raced guide", "x", "guide"],
      ),
    ).rejects.toThrow(/WikiPage_companyId_guide_key/);

    const guides = await runWithTenant(user, () =>
      new GetWikiPagesInteractor(new PrismaWikiPageRepo()).invoke({ page: 1, pageSize: 25, kind: "guide" }),
    );
    expect(guides).toMatchObject({
      ok: true,
      data: { total: 1, items: [{ title: "Operating Guide", kind: "guide" }] },
    });
  });

  it("enforces when-to-use presence for procedures in the database itself", async () => {
    await expect(
      client.query(
        'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "kind", "updatedAt") VALUES ($1, $2, $3, $4, $5, now())',
        [randomUUID(), companyId, "Raw procedure", STEPS, "procedure"],
      ),
    ).rejects.toThrow(/WikiPage_when_to_use_matches_kind/);
  });
});
