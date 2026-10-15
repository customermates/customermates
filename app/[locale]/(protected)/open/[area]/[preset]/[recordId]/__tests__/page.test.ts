import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("de") }));
vi.mock("@/features/auth/next/require", () => ({ requireAccess: () => Promise.resolve() }));
vi.mock("@/core/di", () => ({ getGetRecordNavigationInteractor: () => navigation }));

import { presetId } from "@/features/records/crm-preset";

import OpenAppRecordLinkPage from "../page";

const COMPANY_ID = "10000000-0000-4000-8000-000000000001";
const RECORD_ID = "10000000-0000-4000-8000-000000000002";
const DEAL_TYPE_ID = presetId(COMPANY_ID, "deal");

function open(area: string, preset: string, recordId = RECORD_ID) {
  return OpenAppRecordLinkPage({ params: Promise.resolve({ area, preset, recordId }) });
}

describe("opening a starter record by its preset", () => {
  beforeEach(() => {
    navigation.invoke.mockResolvedValue({
      ok: true,
      data: { companyId: COMPANY_ID, schemaRevision: 1, canManageSchema: false, types: [{ id: DEAL_TYPE_ID }] },
    });
  });

  it("opens the record in the workspace's list of that preset", async () => {
    await expect(open("records", "deal")).rejects.toThrow(`NEXT_REDIRECT /de/records/${DEAL_TYPE_ID}/${RECORD_ID}`);
  });

  it.each([
    ["an unknown preset", "records", "invoice"],
    ["a non-record area", "configure", "deal"],
    ["a starter list the workspace deleted", "records", "contact"],
  ])("answers not found for %s", async (_case, area, preset) => {
    await expect(open(area, preset)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
