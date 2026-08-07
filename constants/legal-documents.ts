export const LEGAL_DOCUMENT_VERSIONS = {
  dpa: "2026-08-07",
  privacy: "2026-08-07",
  subprocessors: "2026-08-07",
  terms: "2026-08-07",
} as const;

// For a supplier-originated subprocessor change, set this to the supplier's
// actual remaining objection deadline when bumping the Subprocessors version.
// Customermates-initiated changes use the standard 14-day period from delivery.
export const SUBPROCESSOR_OBJECTION_DEADLINE: string | null = null;

export type LegalDocument = keyof typeof LEGAL_DOCUMENT_VERSIONS;
export type LegalDocumentVersions = Record<LegalDocument, string>;
export type LegalAcceptanceType = "initial-onboarding" | "later-update";

export const CONTRACT_LEGAL_DOCUMENTS = ["terms", "dpa"] as const satisfies readonly LegalDocument[];
export const INFORMATION_LEGAL_DOCUMENTS = ["privacy", "subprocessors"] as const satisfies readonly LegalDocument[];
export const ALL_LEGAL_DOCUMENTS = [...CONTRACT_LEGAL_DOCUMENTS, ...INFORMATION_LEGAL_DOCUMENTS] as const;

export type LegalNoticeAuditPayload = {
  versions: LegalDocumentVersions;
  changedDocuments: LegalDocument[];
  recipientEmail: string;
  locale: string;
  effectiveAt: string | null;
};

export type LegalAcceptanceAuditPayload = {
  versions: LegalDocumentVersions;
  acceptingEmail: string;
  locale: string;
  acceptanceType: LegalAcceptanceType;
};

export function currentLegalDocumentVersions(): LegalDocumentVersions {
  return { ...LEGAL_DOCUMENT_VERSIONS };
}
