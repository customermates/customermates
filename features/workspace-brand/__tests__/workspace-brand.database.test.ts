import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    BETTER_AUTH_SECRET: "workspace-brand-test-secret-0123456789abcdef",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { createRestRouteWorkspace } = await import("@/tests/helpers/rest-route-workspace");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { GetWorkspaceBrandInteractor } = await import("../get-workspace-brand.interactor");
const { SaveWorkspaceBrandInteractor } = await import("../save-workspace-brand.interactor");
const { ReadWorkspaceBrandLogoInteractor } = await import("../read-workspace-brand-logo.interactor");
const { PrismaWorkspaceBrandRepo } = await import("../prisma-workspace-brand.repository");
const { BRAND_LOGO_MAX_BYTES } = await import("../brand-image");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

const get = () => new GetWorkspaceBrandInteractor(new PrismaWorkspaceBrandRepo());
const save = () => new SaveWorkspaceBrandInteractor(new PrismaWorkspaceBrandRepo());
const logo = () => new ReadWorkspaceBrandLogoInteractor(new PrismaWorkspaceBrandRepo());

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

async function workspace() {
  const created = await createRestRouteWorkspace();
  cleanups.push(created.cleanup);
  return created;
}

function data<T>(result: { ok: true; data: T } | { ok: false }): T {
  if (!result.ok) throw new Error(`Expected success, got ${JSON.stringify(result)}`);
  return result.data;
}

function errorCode(result: unknown): unknown {
  if (!result || typeof result !== "object" || (result as { ok?: unknown }).ok !== false) return null;
  const issue = (result as { error?: { issues?: Array<{ params?: { error?: unknown } }> } }).error?.issues?.[0];
  return issue?.params?.error ?? null;
}

const keyOf = (logoUrl: string | null) => (logoUrl ?? "").slice("/api/brand/logo/".length);

describeDatabase("workspace brand", { timeout: 120_000 }, () => {
  it("starts empty, then saves the accent colour and the logo independently of each other", async () => {
    const w = await workspace();

    expect(data(await w.as(w.admin, () => get().invoke()))).toEqual({ accentColor: null, logoUrl: null });

    const coloured = data(await w.as(w.admin, () => save().invoke({ accentColor: "#0f62fe" })));
    expect(coloured).toEqual({ accentColor: "#0f62fe", logoUrl: null });

    const withLogo = data(await w.as(w.admin, () => save().invoke({ logo: PNG.toString("base64") })));
    expect(withLogo.accentColor).toBe("#0f62fe");
    expect(withLogo.logoUrl).toMatch(/^\/api\/brand\/logo\/[A-Za-z0-9_-]{32}$/u);
    expect(data(await w.as(w.admin, () => get().invoke()))).toEqual(withLogo);

    const served = await logo().invoke({ key: keyOf(withLogo.logoUrl) });
    expect(served?.type).toBe("image/png");
    expect([...(served?.bytes ?? [])]).toEqual([...PNG]);
  });

  it("gives a replaced logo a new address, decides its type by its bytes and stops serving the old one", async () => {
    const w = await workspace();
    const first = data(await w.as(w.admin, () => save().invoke({ logo: PNG.toString("base64") })));
    const second = data(await w.as(w.admin, () => save().invoke({ logo: JPEG.toString("base64") })));

    expect(second.logoUrl).not.toBe(first.logoUrl);
    expect(await logo().invoke({ key: keyOf(first.logoUrl) })).toBeNull();
    expect((await logo().invoke({ key: keyOf(second.logoUrl) }))?.type).toBe("image/jpeg");
    expect(await runWithoutTenant(() => prisma.companyBrand.count({ where: { companyId: w.companyId } }))).toBe(1);
  });

  it("removes the logo and resets the colour", async () => {
    const w = await workspace();
    const branded = data(
      await w.as(w.admin, () => save().invoke({ accentColor: "#0f62fe", logo: PNG.toString("base64") })),
    );

    const withoutLogo = data(await w.as(w.admin, () => save().invoke({ logo: null })));
    expect(withoutLogo).toEqual({ accentColor: "#0f62fe", logoUrl: null });
    expect(await logo().invoke({ key: keyOf(branded.logoUrl) })).toBeNull();

    expect(data(await w.as(w.admin, () => save().invoke({ accentColor: null })))).toEqual({
      accentColor: null,
      logoUrl: null,
    });
    const stored = await runWithoutTenant(() => prisma.companyBrand.findUnique({ where: { companyId: w.companyId } }));
    expect(stored).toMatchObject({ accentColor: null, logo: null, logoType: null, logoKey: null });
  });

  it("refuses an SVG, an oversized image, a malformed colour and an unknown field without storing anything", async () => {
    const w = await workspace();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString("base64");
    const oversized = Buffer.alloc(BRAND_LOGO_MAX_BYTES + 1);
    oversized.set([...PNG]);

    expect(errorCode(await w.as(w.admin, () => save().invoke({ logo: svg })))).toBe("recordFileContentInvalid");
    expect(errorCode(await w.as(w.admin, () => save().invoke({ logo: oversized.toString("base64") })))).toBe(
      "recordFileTooLarge",
    );
    for (const accentColor of ["#0F62FE", "#fff", "blue", "#0f62fe;"]) {
      const refused = await w.as(w.admin, () => save().invoke({ accentColor }));
      expect(refused.ok, accentColor).toBe(false);
    }
    const unknown = await w.as(w.admin, () => save().invoke({ logoType: "image/svg+xml" } as never));
    expect(unknown.ok).toBe(false);

    expect(await runWithoutTenant(() => prisma.companyBrand.count({ where: { companyId: w.companyId } }))).toBe(0);
  });

  it("keeps each workspace's brand to itself and needs the right to manage the workspace", async () => {
    const first = await workspace();
    const second = await workspace();
    const ours = data(
      await first.as(first.admin, () => save().invoke({ accentColor: "#0f62fe", logo: PNG.toString("base64") })),
    );

    expect(data(await second.as(second.admin, () => get().invoke()))).toEqual({ accentColor: null, logoUrl: null });

    const theirs = data(
      await second.as(second.admin, () => save().invoke({ accentColor: "#da1e28", logo: JPEG.toString("base64") })),
    );
    expect(theirs.logoUrl).not.toBe(ours.logoUrl);
    expect(data(await first.as(first.admin, () => get().invoke()))).toEqual(ours);

    data(await second.as(second.admin, () => save().invoke({ logo: null, accentColor: null })));
    expect(data(await first.as(first.admin, () => get().invoke()))).toEqual(ours);
    expect((await logo().invoke({ key: keyOf(ours.logoUrl) }))?.type).toBe("image/png");

    await expect(first.as(first.member, () => save().invoke({ accentColor: "#000000" }))).rejects.toThrow(
      /Access denied/u,
    );
    expect(data(await first.as(first.member, () => get().invoke()))).toEqual(ours);
  });

  it("serves no logo for a malformed or unknown key", async () => {
    expect(await logo().invoke({ key: "short" })).toBeNull();
    expect(await logo().invoke({ key: "../../etc/passwd-padding-padding" })).toBeNull();
    expect(await logo().invoke({ key: "unknown_key_abcdefghijklmnopqrstu" })).toBeNull();
  });

  it("deletes the brand with its workspace", async () => {
    const w = await createRestRouteWorkspace();
    const branded = data(await w.as(w.admin, () => save().invoke({ logo: PNG.toString("base64") })));
    await w.cleanup();

    expect(await runWithoutTenant(() => prisma.companyBrand.count({ where: { companyId: w.companyId } }))).toBe(0);
    expect(await logo().invoke({ key: keyOf(branded.logoUrl) })).toBeNull();
  });
});
