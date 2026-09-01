export const LEGAL_DOCUMENT_VERSIONS = {
  dpa: "2026-09-01",
  privacy: "2026-09-01",
  subprocessors: "2026-09-01",
  terms: "2026-09-01",
} as const;

export const SUPPLIER_SUBPROCESSOR_OBJECTION_DEADLINE: string | null = null;

export type LegalDocument = keyof typeof LEGAL_DOCUMENT_VERSIONS;
export type LegalDocumentVersions = Record<LegalDocument, string>;

export const CONTRACT_LEGAL_DOCUMENTS = ["terms", "dpa"] as const satisfies readonly LegalDocument[];
export const INFORMATION_LEGAL_DOCUMENTS = ["privacy", "subprocessors"] as const satisfies readonly LegalDocument[];
export const ALL_LEGAL_DOCUMENTS = [...CONTRACT_LEGAL_DOCUMENTS, ...INFORMATION_LEGAL_DOCUMENTS] as const;

export function currentLegalDocumentVersions(): LegalDocumentVersions {
  return { ...LEGAL_DOCUMENT_VERSIONS };
}

export function hasCurrentLegalDocumentVersions(
  versions: Partial<LegalDocumentVersions> | null | undefined,
  documents: readonly LegalDocument[],
): boolean {
  return documents.every((document) => versions?.[document] === LEGAL_DOCUMENT_VERSIONS[document]);
}
