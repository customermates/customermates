export const LEGAL_DOCUMENT_VERSIONS = {
  dpa: "1.0",
  privacy: "2026-08-03",
  terms: "2026-08-03",
} as const;

export type LegalAcceptance = {
  legalAcceptedAt: Date;
  legalDpaVersion: string;
  legalPrivacyVersion: string;
  legalTermsVersion: string;
};

export function buildLegalAcceptance(acceptedAt: Date): LegalAcceptance {
  return {
    legalAcceptedAt: acceptedAt,
    legalDpaVersion: LEGAL_DOCUMENT_VERSIONS.dpa,
    legalPrivacyVersion: LEGAL_DOCUMENT_VERSIONS.privacy,
    legalTermsVersion: LEGAL_DOCUMENT_VERSIONS.terms,
  };
}
