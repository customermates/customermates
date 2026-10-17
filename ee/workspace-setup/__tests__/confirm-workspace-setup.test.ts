import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud" } }));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import type { WorkspaceSetupPatch, WorkspaceSetupRecord } from "../workspace-setup.schema";

import { runWithTenant } from "@/core/decorators/tenant-context";

import { ConfirmWorkspaceSetupInteractor } from "../confirm-workspace-setup.interactor";

const SETUP_ID = "5d0b1f9e-2c6a-4f43-9a1e-7b3c2d4e5f60";

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
    const background = { dispatch: vi.fn(() => Promise.resolve()) };
    const confirm = new ConfirmWorkspaceSetupInteractor(repo as never, background);
    const result = await runWithTenant(createMockUser(), () => confirm.invoke({ setupId: SETUP_ID, planRevision: 2 }));
    expect(result).toEqual({ ok: true, data: { setupId: SETUP_ID } });
    expect(order).toEqual(["locale crawl-1 de", "mutate building"]);
    expect(background.dispatch).toHaveBeenCalledWith(
      "build-workspace-setup",
      expect.objectContaining({ setupId: SETUP_ID }),
    );
  });
});
