import { describe, expect, it, vi } from "vitest";

import { unwrapValidated } from "@/core/validation/validation.utils";
import { googleAdsConversionCsv } from "../ad-conversion-csv";
import {
  GetAdConversionExportInteractor,
  type AdConversionExportRow,
} from "../get/get-ad-conversion-export.interactor";

vi.mock("@/env", () => ({ env: { BETTER_AUTH_SECRET: "test-secret" } }));
vi.mock("@/core/decorators/operator-interactor.decorator", () => ({ OperatorInteractor: () => undefined }));
vi.mock("@/core/decorators/validate-output.decorator", () => ({ ValidateOutput: () => undefined }));

const NOW = new Date("2026-09-02T12:00:00.000Z");

function row(overrides: Partial<AdConversionExportRow> = {}): AdConversionExportRow {
  return {
    companyId: "company-1",
    provider: "google_ads",
    identifierKind: "gclid",
    identifierValue: "Case-Sensitive_GCLID",
    clickedAt: new Date("2026-09-01T10:00:00.000Z"),
    conversionType: "signup",
    conversionAt: new Date("2026-09-01T11:00:00.000Z"),
    ...overrides,
  };
}

function exportFor(rows: AdConversionExportRow[]) {
  const interactor = new GetAdConversionExportInteractor({
    listAdConversionCandidatesUnscoped: () => Promise.resolve(rows),
  });
  return unwrapValidated(interactor.invoke(NOW));
}

describe("ad conversion export", () => {
  it("emits a stable order id so a repeated export deduplicates at the platform", async () => {
    const first = await exportFor([row()]);
    const second = await exportFor([row()]);

    expect(first.rows[0]?.orderId).toBe(second.rows[0]?.orderId);
    expect(first.rows[0]?.orderId).toMatch(/^[0-9a-f]{32}$/);
    expect(first.rows[0]?.orderId).not.toContain("company-1");
  });

  it("excludes a conversion past its provider's reporting deadline", async () => {
    const stale = row({
      provider: "openai_ads",
      identifierKind: "oppref",
      identifierValue: "Opaque",
      conversionAt: new Date("2026-08-20T11:00:00.000Z"),
    });

    const exported = await exportFor([row(), stale]);

    expect(exported.rows.map((entry) => entry.provider)).toEqual(["google_ads"]);
  });

  it("marks every exported row as consented because a row exists only after an allow decision", async () => {
    const exported = await exportFor([row(), row({ companyId: "company-2" })]);

    expect(exported.rows.map((entry) => entry.adUserData)).toEqual(["Granted", "Granted"]);
    expect(exported.rows.map((entry) => entry.adPersonalization)).toEqual(["Denied", "Denied"]);
  });

  it("writes Google's upload shape with an explicit time zone line", async () => {
    const exported = await exportFor([row()]);
    const csv = googleAdsConversionCsv(exported).split("\n");

    expect(csv[0]).toBe("Parameters:TimeZone=+0000");
    expect(csv[1]).toBe("Google Click ID,Conversion Name,Conversion Time,Order ID,Ad User Data,Ad Personalization");
    expect(csv[2]).toMatch(
      /^Case-Sensitive_GCLID,Customermates signup,2026-09-01 11:00:00\+0000,[0-9a-f]{32},Granted,Denied$/,
    );
  });

  it("keeps every non-Google identifier out of the Google upload file", async () => {
    const openAi = row({
      companyId: "company-2",
      provider: "openai_ads",
      identifierKind: "oppref",
      identifierValue: "Opaque-OPPREF",
      conversionType: "paid",
    });
    const csv = googleAdsConversionCsv(await exportFor([row(), openAi]));

    expect(csv).not.toContain("Opaque-OPPREF");
    expect(csv).toContain("Case-Sensitive_GCLID");
    expect(csv.trim().split("\n")).toHaveLength(3);
  });

  it("does not let the platform link the signup and paid conversions of one workspace", async () => {
    const exported = await exportFor([row(), row({ conversionType: "paid" })]);

    const [signup, paid] = exported.rows;
    expect(signup?.orderId).not.toBe(paid?.orderId);
    expect(`${signup?.orderId}${paid?.orderId}`).not.toContain("company-1");
  });
});
