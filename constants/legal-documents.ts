export const LEGAL_DOCUMENT_VERSIONS = {
  dpa: "2026-08-07",
  privacy: "2026-08-07",
  subprocessors: "2026-08-07",
  terms: "2026-08-07",
} as const;

export type LegalDocument = keyof typeof LEGAL_DOCUMENT_VERSIONS;
export type LegalDocumentVersions = Record<LegalDocument, string>;
export type LegalAcceptanceType = "initial-onboarding" | "later-update";

export const CONTRACT_LEGAL_DOCUMENTS = ["terms", "dpa"] as const satisfies readonly LegalDocument[];
export const INFORMATION_LEGAL_DOCUMENTS = ["privacy", "subprocessors"] as const satisfies readonly LegalDocument[];
export const ALL_LEGAL_DOCUMENTS = [...CONTRACT_LEGAL_DOCUMENTS, ...INFORMATION_LEGAL_DOCUMENTS] as const;

function buildVersionKey(documents: readonly LegalDocument[]): string {
  return documents.map((document) => `${document}:${LEGAL_DOCUMENT_VERSIONS[document]}`).join("|");
}

export const LEGAL_CONTRACT_KEY = buildVersionKey(CONTRACT_LEGAL_DOCUMENTS);
export const LEGAL_INFORMATION_KEY = buildVersionKey(INFORMATION_LEGAL_DOCUMENTS);

export type LegalAuditUserSnapshot = {
  id: string;
  email: string;
};

export type LegalNoticeAuditPayload = {
  versions: LegalDocumentVersions;
  contractKey: string;
  informationKey: string;
  changedDocuments: LegalDocument[];
  recipient: LegalAuditUserSnapshot;
  locale: string;
  noticeAt: string;
  effectiveAt: string | null;
  providerMessageId: string;
  deployedGitCommit: string;
  acceptanceType: null;
};

export type LegalAcceptanceAuditPayload = {
  versions: LegalDocumentVersions;
  contractKey: string;
  informationKey: string;
  changedDocuments: LegalDocument[];
  acceptingUser: LegalAuditUserSnapshot;
  locale: string;
  noticeAt: string | null;
  effectiveAt: string;
  providerMessageId: string | null;
  deployedGitCommit: string;
  acceptanceType: LegalAcceptanceType;
};

export function currentLegalDocumentVersions(): LegalDocumentVersions {
  return { ...LEGAL_DOCUMENT_VERSIONS };
}
