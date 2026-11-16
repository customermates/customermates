import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

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
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { createRestRouteWorkspace } = await import("@/tests/helpers/rest-route-workspace");
const { PrismaPublicFormRepo } = await import("../prisma-public-form.repository");
const { PUBLIC_FORM_SUBMISSION_RETENTION_DAYS, PrunePublicFormSubmissionsInteractor } = await import(
  "../prune-public-form-submissions.interactor"
);
const { createConfig } = await import("./public-form-fixtures");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

const DAY_MS = 86_400_000;

describeDatabase("pruning public form submissions", { timeout: 60_000 }, () => {
  it("deletes submissions past the retention window, keeps the form counter and the newer rows", async () => {
    const w = await createRestRouteWorkspace();
    cleanups.push(w.cleanup);
    const now = new Date("2026-11-16T09:00:00.000Z");
    const at = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const form = await runWithoutTenant(() =>
      prisma.publicForm.create({
        data: {
          companyId: w.companyId,
          typeId: w.id("organization"),
          name: "Contact",
          createdById: w.admin.id,
          config: createConfig() as never,
          submissionCount: 3,
        },
      }),
    );
    const submit = (age: number) =>
      runWithoutTenant(() =>
        prisma.publicFormSubmission.create({
          data: { companyId: w.companyId, formId: form.id, outcome: "created", ipHash: "hash", createdAt: at(age) },
        }),
      );
    const expired = await submit(PUBLIC_FORM_SUBMISSION_RETENTION_DAYS + 1);
    const kept = await submit(PUBLIC_FORM_SUBMISSION_RETENTION_DAYS - 1);
    const fresh = await submit(0);

    const repo = new PrismaPublicFormRepo();
    const pruned = await runWithoutTenant(() => new PrunePublicFormSubmissionsInteractor(repo).invoke({ now }));

    expect(pruned).toEqual({ pruned: 1 });
    const left = await runWithoutTenant(() =>
      prisma.publicFormSubmission.findMany({ where: { formId: form.id }, select: { id: true } }),
    );
    expect(left.map((row) => row.id).sort()).toEqual([kept.id, fresh.id].sort());
    expect(expired.id).not.toBe(kept.id);
    expect(await runWithoutTenant(() => prisma.publicForm.findUniqueOrThrow({ where: { id: form.id } }))).toMatchObject(
      {
        submissionCount: 3,
      },
    );
  });
});
