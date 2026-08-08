import { describe, expect, it } from "vitest";

import { currentLegalDocumentVersions } from "@/constants/legal-documents";
import {
  hasValidLegalNoticeEffectiveAt,
  LegalAcceptanceAuditPayloadSchema,
  LegalNoticeAuditPayloadSchema,
  type LegalAcceptanceAuditPayload,
  type LegalNoticeAuditPayload,
} from "../legal-audit.schema";

const noticePayload: LegalNoticeAuditPayload = {
  versions: currentLegalDocumentVersions(),
  changedDocuments: ["terms", "dpa"],
  recipientEmail: "admin@example.com",
  effectiveAt: "2026-08-22T00:00:00.000Z",
};

const acceptancePayload: LegalAcceptanceAuditPayload = {
  versions: currentLegalDocumentVersions(),
  acceptingEmail: "admin@example.com",
  acceptanceType: "later-update",
};

describe("legal audit payload schemas", () => {
  it("accepts complete notice and acceptance payloads", () => {
    expect(LegalNoticeAuditPayloadSchema.parse(noticePayload)).toEqual(noticePayload);
    expect(LegalAcceptanceAuditPayloadSchema.parse(acceptancePayload)).toEqual(acceptancePayload);
  });

  it.each([
    null,
    "malformed",
    { versions: currentLegalDocumentVersions() },
    { ...noticePayload, changedDocuments: [] },
    { ...noticePayload, changedDocuments: ["unknown"] },
    { ...noticePayload, effectiveAt: "not-a-date" },
  ])("rejects malformed notice evidence %#", (payload) => {
    expect(LegalNoticeAuditPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it.each([
    null,
    42,
    { versions: currentLegalDocumentVersions() },
    { ...acceptancePayload, versions: { terms: "2026-08-07" } },
    { ...acceptancePayload, acceptanceType: "silent" },
  ])("rejects malformed acceptance evidence %#", (payload) => {
    expect(LegalAcceptanceAuditPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("requires an actual valid deadline where a workflow needs one", () => {
    expect(hasValidLegalNoticeEffectiveAt({ ...noticePayload, effectiveAt: null })).toBe(false);
    expect(
      hasValidLegalNoticeEffectiveAt({
        ...noticePayload,
        effectiveAt: "not-a-date",
      }),
    ).toBe(false);
    expect(hasValidLegalNoticeEffectiveAt(noticePayload)).toBe(true);
  });
});
