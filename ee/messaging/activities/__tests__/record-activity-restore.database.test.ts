import { createTranslator } from "next-intl";
import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import messages from "@/i18n/locales/en.json";

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
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace: namespace as never })),
}));

await import("@/core/di");
const { createRestRouteWorkspace, postAs, restRoute } = await import("@/tests/helpers/rest-route-workspace");
const { getRestoreTrashInteractor } = await import("@/core/di");
const activitiesRoute = await restRoute("/v1/records/activities");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

describeDatabase("record activities after a Trash restore", () => {
  it("lists the restore of a record after its deletion", async () => {
    const w = await createRestRouteWorkspace();
    cleanups.push(w.cleanup);
    const contact = await w.create("contact", "contact.firstName", "Restored contact");
    const deleted = await w.remove(contact);
    if (!deleted.trashBatchId) throw new Error("Trash batch missing");
    const batchId = deleted.trashBatchId;
    expect(await w.as(w.admin, () => getRestoreTrashInteractor().invoke({ batchId }))).toMatchObject({
      ok: true,
      data: { status: "completed" },
    });

    const activities = await postAs(w, w.admin, activitiesRoute, { scope: { records: [contact], typeIds: [] } });

    expect(activities.status).toBe(200);
    const items = (activities.body as { items: Array<{ kind: string; event?: unknown }> }).items;
    expect(items.filter((item) => item.kind === "record").map((item) => item.event)).toEqual([
      "record.restored",
      "record.deleted",
      "record.created",
    ]);
  }, 180_000);
});
