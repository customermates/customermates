import type { TenantUser } from "@/features/user/user.schema";
import type { TrashKindHandler } from "../trash-kind-handler";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

import { PermissionService } from "@/core/base/permission.service";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { PrismaTrashRepo } = await import("../prisma-trash.repository");
const { EntityTrashHandler } = await import("../entity-trash.handler");
const { EntityTrashVisibility } = await import("../entity-trash-visibility");
const { QueryTrashInteractor } = await import("../query-trash.interactor");
const { RestoreTrashInteractor } = await import("../restore-trash.interactor");
const { DeleteTrashPermanentlyInteractor } = await import("../delete-trash-permanently.interactor");
const { EmptyTrashInteractor } = await import("../empty-trash.interactor");
const { TRASH_PURGE_BATCH_SIZE } = await import("../purge-company-trash.interactor");
const { PreviewTrashDeletionInteractor } = await import("../preview-trash-deletion.interactor");
const { createTestRecordRepo, createTestDataViewRepo } = await import("@/tests/helpers/record-repository");
const { PrismaP13nRepo } = await import("@/features/p13n/prisma-p13n.repository");
const { DeleteDataViewInteractor } = await import("@/features/data-view/delete-data-view.interactor");
const { PrismaWidgetRepo } = await import("@/features/widget/prisma-widget.repository");
const { LIVE_WIDGET } = await import("@/features/widget/live-widget");
const { WidgetTrashBlockers } = await import("@/features/widget/widget-trash-blockers");
const { DeleteWidgetInteractor } = await import("@/features/widget/delete-widget.interactor");
const { ValidateWidgetIdsInteractor } = await import("@/core/validation/validators/validate-widget-ids.interactor");
const { PrismaWikiPageRepo } = await import("@/features/wiki/prisma-wiki-page.repository");
const { DeleteWikiPageInteractor } = await import("@/features/wiki/delete-wiki-page.interactor");
const { getRoutineRepo, getTrashKindHandlers } = await import("@/core/di");
const { DeleteRoutineInteractor } = await import("@/ee/routines/delete-routine.interactor");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const events = { publish: () => Promise.resolve() } as never;

async function fixture() {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const adminRole = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const memberRole = await prisma.userRole.create({ data: { companyId: company.id, name: "Member" } });
    const [admin, member] = await Promise.all(
      [adminRole, memberRole].map((role, index) =>
        prisma.user.create({
          data: {
            companyId: company.id,
            roleId: role.id,
            firstName: index ? "Member" : "Admin",
            lastName: "Test",
            email: `${randomUUID()}@example.test`,
            status: "active",
          },
        }),
      ),
    );
    return { company, adminRole, memberRole, admin, member };
  });
  const admin = createMockUser({ ...seed.admin, role: { ...seed.adminRole, permissions: [] } });
  const member = createMockUser({ ...seed.member, role: { ...seed.memberRole, permissions: [] } });
  const trashRepo = new PrismaTrashRepo();
  const visibility = new EntityTrashVisibility();
  const widgets = new PrismaWidgetRepo();
  const wiki = new PrismaWikiPageRepo(new PermissionService());
  const handlers: TrashKindHandler[] = [
    new EntityTrashHandler(
      { kind: "view", restoreOrder: 2, visibility: visibility.owned("view") },
      createTestDataViewRepo(),
      trashRepo,
      events,
    ),
    new EntityTrashHandler(
      {
        kind: "widget",
        restoreOrder: 3,
        visibility: visibility.owned("widget"),
        blockers: new WidgetTrashBlockers(widgets),
      },
      widgets,
      trashRepo,
      events,
    ),
    new EntityTrashHandler(
      { kind: "routine", restoreOrder: 2, visibility: visibility.administered("routine") },
      getRoutineRepo(),
      trashRepo,
      events,
    ),
  ];
  const trash = {
    query: new QueryTrashInteractor(trashRepo, createTestRecordRepo(), handlers),
    restore: new RestoreTrashInteractor(trashRepo, handlers),
    preview: new PreviewTrashDeletionInteractor(trashRepo, handlers),
    remove: new DeleteTrashPermanentlyInteractor(trashRepo, handlers),
  };
  const items = (as: TenantUser) =>
    runWithTenant(as, () => trash.query.invoke({ page: 1, pageSize: 100 })).then((result) => {
      if (!result.ok) throw new Error(JSON.stringify(result));
      return result.data.items;
    });
  const restore = (as: TenantUser, batchId: string) =>
    runWithTenant(as, () => trash.restore.invoke({ batchId } as never));
  const purge = async (as: TenantUser, itemIds: string[]) => {
    const preview = await runWithTenant(as, () => trash.preview.invoke({ itemIds }));
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    return runWithTenant(as, () => trash.remove.invoke({ itemIds, expectedImpactHash: preview.data.impactHash }));
  };
  const tx = <T>(as: TenantUser, fn: () => Promise<T>) => runWithTenant(as, () => runInTransaction(fn));
  return { seed, admin, member, trash, items, restore, purge, tx, widgets, wiki };
}

describeDatabase("views, widgets, routines and knowledge base pages in Trash", () => {
  it("empties a Trash larger than one purge batch, each item in its own short transaction", async () => {
    const f = await fixture();
    const companyId = f.seed.company.id;
    const count = TRASH_PURGE_BATCH_SIZE * 2 + 5;
    const ids = Array.from({ length: count }, () => randomUUID());
    await runWithoutTenant(async () => {
      const deletedAt = new Date();
      await prisma.dataView.createMany({
        data: ids.map((id, position) => ({
          id,
          companyId,
          userId: f.seed.admin.id,
          surfaceKey: "routines-card-store",
          name: `View ${position}`,
          position,
          deletedAt,
        })),
      });
      await prisma.trashItem.createMany({
        data: ids.map((targetId, position) => ({
          id: randomUUID(),
          companyId,
          kind: "view" as const,
          targetId,
          ownerUserId: f.seed.admin.id,
          label: `View ${position}`,
          deletedById: f.seed.admin.id,
          deletedAt,
          expiresAt: new Date(deletedAt.getTime() + 86_400_000),
          batchId: randomUUID(),
        })),
      });
    });
    const trashRepo = new PrismaTrashRepo();
    const handlers = [
      new EntityTrashHandler(
        { kind: "view", restoreOrder: 2, visibility: new EntityTrashVisibility().owned("view") },
        createTestDataViewRepo(),
        trashRepo,
        events,
      ),
    ];
    const preview = await runWithTenant(f.admin, () =>
      new PreviewTrashDeletionInteractor(trashRepo, handlers).invoke({ all: true }),
    );
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    const admin = { load: () => Promise.resolve({ actor: { id: f.seed.admin.id }, isAdmin: true }) } as never;
    const transactions = vi.spyOn(prisma, "$transaction");
    const result = await runWithTenant(f.admin, () =>
      new EmptyTrashInteractor(trashRepo, admin, handlers).invoke({ expectedImpactHash: preview.data.impactHash }),
    );
    expect(result).toMatchObject({ ok: true, data: { pendingItemIds: [], failedItemIds: [] } });
    expect(result.ok && result.data.deletedItemIds).toHaveLength(count);
    expect(transactions.mock.calls.length).toBeGreaterThanOrEqual(count);
    transactions.mockRestore();
    expect(
      await runWithoutTenant(() =>
        Promise.all([
          prisma.trashItem.count({ where: { companyId } }),
          prisma.dataView.count({ where: { companyId, id: { in: ids } } }),
        ]),
      ),
    ).toEqual([0, 0]);
  }, 120_000);

  it("moves an owned view to Trash, hides it, restores it with Undo and purges it permanently", async () => {
    const f = await fixture();
    const views = createTestDataViewRepo();
    const view = await f.tx(f.admin, () =>
      views.createView({ surfaceKey: "routines-card-store", name: "Mine", position: 0, state: {} }),
    );
    const remove = new DeleteDataViewInteractor(views, new PrismaP13nRepo(), new PrismaTrashRepo());
    const deleted = await runWithTenant(f.admin, () => remove.invoke({ id: view.id }));
    if (!deleted.ok) throw new Error(JSON.stringify(deleted));

    expect(await runWithTenant(f.admin, () => views.listDataViews("routines-card-store"))).toEqual([]);
    expect((await f.items(f.admin)).map((item) => [item.kind, item.label])).toEqual([["view", "Mine"]]);
    expect(await f.items(f.member)).toEqual([]);

    expect(await f.restore(f.admin, deleted.data.trashBatchId)).toMatchObject({ ok: true, data: { blocked: [] } });
    expect((await runWithTenant(f.admin, () => views.listDataViews("routines-card-store"))).map((v) => v.id)).toEqual([
      view.id,
    ]);
    expect(await f.items(f.admin)).toEqual([]);

    const again = await runWithTenant(f.admin, () => remove.invoke({ id: view.id }));
    if (!again.ok) throw new Error(JSON.stringify(again));
    const [item] = await f.items(f.admin);
    expect(await f.purge(f.admin, [item.id])).toMatchObject({ ok: true });
    expect(await runWithoutTenant(() => prisma.dataView.count({ where: { id: view.id } }))).toBe(0);
    expect(await f.items(f.admin)).toEqual([]);
  });

  it("hides widgets with their dashboard view and refuses to restore one while its view is in Trash", async () => {
    const f = await fixture();
    const views = createTestDataViewRepo();
    const view = await f.tx(f.admin, () =>
      views.createView({ surfaceKey: "dashboard", name: "Board", position: 0, state: {} }),
    );
    const [onView, loose] = await runWithoutTenant(() =>
      Promise.all(
        ["On view", "Loose"].map((name, index) =>
          prisma.widget.create({
            data: { companyId: f.seed.company.id, userId: f.seed.admin.id, name, viewId: index ? null : view.id },
          }),
        ),
      ),
    );
    const removeWidget = new DeleteWidgetInteractor(
      f.widgets,
      new ValidateWidgetIdsInteractor(f.widgets),
      new PrismaTrashRepo(),
    );
    const widgetDeleted = await runWithTenant(f.admin, () => removeWidget.invoke({ id: onView.id }));
    if (!widgetDeleted.ok) throw new Error(JSON.stringify(widgetDeleted));
    const viewDeleted = await runWithTenant(f.admin, () =>
      new DeleteDataViewInteractor(views, new PrismaP13nRepo(), new PrismaTrashRepo()).invoke({ id: view.id }),
    );
    if (!viewDeleted.ok) throw new Error(JSON.stringify(viewDeleted));

    const widgetRestore = await f.restore(f.admin, widgetDeleted.data.trashBatchId);
    expect(widgetRestore).toMatchObject({
      ok: true,
      data: { restoredItemIds: [], blocked: [{ reason: "parentDeleted" }] },
    });
    const live = await runWithoutTenant(() =>
      prisma.widget.findMany({ where: { companyId: f.seed.company.id, ...LIVE_WIDGET }, select: { id: true } }),
    );
    expect(live).toEqual([{ id: loose.id }]);

    const viewItems = (await f.items(f.admin)).filter((item) => item.kind === "view");
    expect(
      await f.purge(
        f.admin,
        viewItems.map((item) => item.id),
      ),
    ).toMatchObject({ ok: true });
    expect(
      await runWithoutTenant(() =>
        prisma.widget.findMany({ where: { companyId: f.seed.company.id }, select: { id: true } }),
      ),
    ).toEqual([{ id: loose.id }]);
  });

  it("stops a trashed routine from running, shows it only to admins and reschedules it on restore", async () => {
    const f = await fixture();
    const routine = await runWithoutTenant(() =>
      prisma.routine.create({
        data: {
          companyId: f.seed.company.id,
          ownerUserId: f.seed.admin.id,
          name: "Digest",
          prompt: "Summarize",
          triggerKind: "schedule",
          cronExpression: "0 9 * * *",
          timezone: "Europe/Berlin",
          nextRunAt: new Date(Date.now() - 60_000),
        },
      }),
    );
    const deleted = await runWithTenant(f.admin, () =>
      new DeleteRoutineInteractor(getRoutineRepo(), events, new PrismaTrashRepo()).invoke({ id: routine.id }),
    );
    if (!deleted.ok) throw new Error(JSON.stringify(deleted));

    const due = await runWithoutTenant(() => getRoutineRepo().findDueRoutinesUnscoped(new Date(), 100));
    expect(due.map((candidate) => candidate.id)).not.toContain(routine.id);
    expect(await f.items(f.member)).toEqual([]);
    expect((await f.items(f.admin)).map((item) => item.kind)).toEqual(["routine"]);

    expect(await f.restore(f.admin, deleted.data.trashBatchId)).toMatchObject({ ok: true, data: { blocked: [] } });
    const restored = await runWithoutTenant(() => prisma.routine.findUniqueOrThrow({ where: { id: routine.id } }));
    expect(restored.deletedAt).toBeNull();
    expect(restored.nextRunAt?.getTime() ?? 0).toBeGreaterThan(Date.now());
  });

  it("keeps a trashed routine in Trash while its owner is at the plan's routine allowance", async () => {
    const f = await fixture();
    await runWithoutTenant(() =>
      prisma.subscription.create({ data: { companyId: f.seed.company.id, plan: "starter", status: "active" } }),
    );
    const routine = (name: string) =>
      runWithoutTenant(() =>
        prisma.routine.create({
          data: {
            companyId: f.seed.company.id,
            ownerUserId: f.seed.admin.id,
            name,
            prompt: "Summarize",
            enabled: false,
            triggerKind: "schedule",
            cronExpression: "0 9 * * *",
            timezone: "Europe/Berlin",
          },
        }),
      );
    const remove = new DeleteRoutineInteractor(getRoutineRepo(), events, new PrismaTrashRepo());
    const trashed = await routine("Trashed digest");
    const deleted = await runWithTenant(f.admin, () => remove.invoke({ id: trashed.id }));
    if (!deleted.ok) throw new Error(JSON.stringify(deleted));
    const replacement = await routine("Replacement digest");
    const restoreAll = new RestoreTrashInteractor(new PrismaTrashRepo(), getTrashKindHandlers());

    const refused = await runWithTenant(f.admin, () =>
      restoreAll.invoke({ batchId: deleted.data.trashBatchId } as never),
    );

    expect(refused).toMatchObject({
      ok: true,
      data: { restoredItemIds: [], blocked: [{ reason: "routineLimitReached", limit: 1, typeId: null }] },
    });
    expect(
      (await runWithoutTenant(() => prisma.routine.findUniqueOrThrow({ where: { id: trashed.id } }))).deletedAt,
    ).not.toBeNull();
    expect((await f.items(f.admin)).map((item) => item.kind)).toEqual(["routine"]);

    const freed = await runWithTenant(f.admin, () => remove.invoke({ id: replacement.id }));
    if (!freed.ok) throw new Error(JSON.stringify(freed));
    const restored = await runWithTenant(f.admin, () =>
      restoreAll.invoke({ batchId: deleted.data.trashBatchId } as never),
    );

    expect(restored).toMatchObject({ ok: true, data: { blocked: [] } });
    expect(
      await runWithoutTenant(() =>
        prisma.routine.count({
          where: { companyId: f.seed.company.id, ownerUserId: f.seed.admin.id, deletedAt: null },
        }),
      ),
    ).toBe(1);
  });

  it("keeps a trashed knowledge base page out of lists and search and blocks restoring a second guide", async () => {
    const f = await fixture();
    const handlers = getTrashKindHandlers();
    expect(handlers.some((handler) => handler.kinds.includes("wikiPage"))).toBe(true);
    const [guide, page] = await runWithoutTenant(() =>
      Promise.all(
        [
          { title: "Operating guide", kind: "guide" as const },
          { title: "Refund policy", kind: "knowledge" as const },
        ].map((data) =>
          prisma.wikiPage.create({
            data: { companyId: f.seed.company.id, markdown: "Refunds take five days.", ...data },
          }),
        ),
      ),
    );
    const remove = new DeleteWikiPageInteractor(f.wiki, events, new PrismaTrashRepo());
    const removedPage = await runWithTenant(f.admin, () =>
      remove.invoke({ id: page.id, expectedUpdatedAt: page.updatedAt }),
    );
    const removedGuide = await runWithTenant(f.admin, () =>
      remove.invoke({ id: guide.id, expectedUpdatedAt: guide.updatedAt }),
    );
    if (!removedPage.ok || !removedGuide.ok) throw new Error("Pages could not be moved to Trash");

    const listed = await runWithTenant(f.admin, () => f.wiki.listPages({ page: 1, pageSize: 25 }));
    expect(listed.total).toBe(0);
    const found = await runWithTenant(f.admin, () => f.wiki.fullTextPageCandidates("refunds", 10));
    expect(found.keys).toEqual([]);
    expect(await runWithTenant(f.admin, () => f.wiki.getPage(page.id))).toBeNull();

    await runWithoutTenant(() =>
      prisma.wikiPage.create({
        data: { companyId: f.seed.company.id, title: "New guide", markdown: "Hello", kind: "guide" },
      }),
    );
    const restoreAll = new RestoreTrashInteractor(new PrismaTrashRepo(), handlers);
    const restoredGuide = await runWithTenant(f.admin, () =>
      restoreAll.invoke({ batchId: removedGuide.data.trashBatchId } as never),
    );
    expect(restoredGuide).toMatchObject({ ok: true, data: { blocked: [{ reason: "nameTaken" }] } });
    const restoredPage = await runWithTenant(f.admin, () =>
      restoreAll.invoke({ batchId: removedPage.data.trashBatchId } as never),
    );
    expect(restoredPage).toMatchObject({ ok: true, data: { blocked: [] } });
    expect((await runWithTenant(f.admin, () => f.wiki.getPage(page.id)))?.id).toBe(page.id);
  });
});

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});
