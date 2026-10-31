import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud" } }));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/observability/server", () => ({ captureException: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import type { WorkspaceSetupPatch, WorkspaceSetupRecord } from "../workspace-setup.schema";

import { runWithTenant } from "@/core/decorators/tenant-context";

import { ConfirmWorkspaceSetupInteractor } from "../confirm-workspace-setup.interactor";

const SETUP_ID = "5d0b1f9e-2c6a-4f43-9a1e-7b3c2d4e5f60";
const company = (name: string | null) => ({ id: "company-1", name, createdAt: new Date(0), updatedAt: new Date(0) });
const nameAnswer = (value: string) => ({
  companyName: { source: "user", confidence: 1, value: { format: "shortText", value } },
});

function plannedSetup(answers: Record<string, unknown>) {
  let setup = {
    id: SETUP_ID,
    status: "planned",
    planRevision: 2,
    plan: {},
    crawlId: "crawl-1",
    answers,
    phases: {},
  } as unknown as WorkspaceSetupRecord;
  return {
    get: vi.fn(() => Promise.resolve(setup)),
    reopenCrawlSynthesis: vi.fn(() => Promise.resolve(true)),
    setCrawlLocale: vi.fn(() => Promise.resolve()),
    mutate: vi.fn((_id: string, change: (current: WorkspaceSetupRecord) => WorkspaceSetupPatch | null) => {
      const patch = change(setup);
      if (patch) setup = { ...setup, ...patch };
      return Promise.resolve({ setup, changed: Boolean(patch) });
    }),
  };
}

async function confirmWith(answers: Record<string, unknown>, workspaceName: string | null) {
  const companies = { findCompanyOrThrow: vi.fn(() => Promise.resolve(company(workspaceName))) };
  const rename = { invoke: vi.fn(() => Promise.resolve({ ok: true as const, data: { name: "" } })) };
  const background = { dispatch: vi.fn(() => Promise.resolve()) };
  const confirm = new ConfirmWorkspaceSetupInteractor(plannedSetup(answers) as never, background, companies, rename, {
    require: vi.fn(() => Promise.resolve(null)),
  });
  await runWithTenant(createMockUser(), () => confirm.invoke({ setupId: SETUP_ID, planRevision: 2 }));
  return rename.invoke;
}

describe("confirming the workspace setup", () => {
  it("switches the website import to the workspace language before the build can plan its pages", async () => {
    const order: string[] = [];
    let setup = {
      id: SETUP_ID,
      status: "planned",
      planRevision: 2,
      plan: {},
      crawlId: "crawl-1",
      answers: { language: { source: "user", confidence: 1, value: { format: "singleChoice", value: "de" } } },
      phases: {},
    } as unknown as WorkspaceSetupRecord;
    const repo = {
      get: vi.fn(() => Promise.resolve(setup)),
      reopenCrawlSynthesis: vi.fn(() => Promise.resolve(false)),
      setCrawlLocale: vi.fn((crawlId: string, locale: string) => {
        order.push(`locale ${crawlId} ${locale}`);
        return Promise.resolve();
      }),
      mutate: vi.fn((_id: string, change: (current: WorkspaceSetupRecord) => WorkspaceSetupPatch | null) => {
        const patch = change(setup);
        if (patch) setup = { ...setup, ...patch };
        order.push(`mutate ${setup.status}`);
        return Promise.resolve({ setup, changed: Boolean(patch) });
      }),
    };
    const background = {
      dispatch: vi.fn((name: string) => {
        order.push(`dispatch ${name}`);
        return Promise.resolve();
      }),
    };
    const companies = { findCompanyOrThrow: vi.fn(() => Promise.resolve(company(null))) };
    const rename = { invoke: vi.fn(() => Promise.resolve({ ok: true as const, data: { name: "" } })) };
    const confirm = new ConfirmWorkspaceSetupInteractor(repo as never, background, companies, rename, {
      require: vi.fn(() => Promise.resolve(null)),
    });
    const result = await runWithTenant(createMockUser(), () => confirm.invoke({ setupId: SETUP_ID, planRevision: 2 }));
    expect(result).toEqual({ ok: true, data: { setupId: SETUP_ID } });
    expect(order).toEqual(["mutate building", "locale crawl-1 de", "dispatch build-workspace-setup"]);
    expect(background.dispatch).toHaveBeenCalledWith(
      "build-workspace-setup",
      expect.objectContaining({ setupId: SETUP_ID }),
    );
  });

  it("leaves the website import alone when a stale tab confirms an older plan", async () => {
    const repo = plannedSetup({});
    const background = { dispatch: vi.fn(() => Promise.resolve()) };
    const companies = { findCompanyOrThrow: vi.fn(() => Promise.resolve(company(null))) };
    const rename = { invoke: vi.fn(() => Promise.resolve({ ok: true as const, data: { name: "" } })) };
    const confirm = new ConfirmWorkspaceSetupInteractor(repo as never, background, companies, rename, {
      require: vi.fn(() => Promise.resolve(null)),
    });
    const result = await runWithTenant(createMockUser(), () => confirm.invoke({ setupId: SETUP_ID, planRevision: 1 }));
    expect(result.ok).toBe(false);
    expect(repo.reopenCrawlSynthesis).not.toHaveBeenCalled();
    expect(background.dispatch).not.toHaveBeenCalled();
  });

  it("still starts the build when naming the workspace fails", async () => {
    const background = { dispatch: vi.fn(() => Promise.resolve()) };
    const companies = { findCompanyOrThrow: vi.fn(() => Promise.reject(new Error("database unavailable"))) };
    const rename = { invoke: vi.fn(() => Promise.resolve({ ok: true as const, data: { name: "" } })) };
    const confirm = new ConfirmWorkspaceSetupInteractor(
      plannedSetup(nameAnswer("Bergmann Steuern")) as never,
      background,
      companies,
      rename,
      { require: vi.fn(() => Promise.resolve(null)) },
    );
    const result = await runWithTenant(createMockUser(), () => confirm.invoke({ setupId: SETUP_ID, planRevision: 2 }));
    expect(result).toEqual({ ok: true, data: { setupId: SETUP_ID } });
    expect(background.dispatch).toHaveBeenCalledWith("build-workspace-setup", expect.anything());
  });

  it("names a workspace that has no name yet from the setup answer", async () => {
    const rename = await confirmWith(nameAnswer("  Bergmann Steuern "), null);
    expect(rename).toHaveBeenCalledExactlyOnceWith({ name: "Bergmann Steuern" });
  });

  it("keeps a name the owner already gave the workspace", async () => {
    expect(await confirmWith(nameAnswer("Bergmann Steuern"), "Steuern")).not.toHaveBeenCalled();
  });

  it("leaves an unnamed workspace unnamed without a usable answer", async () => {
    expect(await confirmWith(nameAnswer("x".repeat(81)), null)).not.toHaveBeenCalled();
    expect(await confirmWith({}, null)).not.toHaveBeenCalled();
  });
});
