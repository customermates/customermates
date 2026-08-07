export const LEGAL_DOCUMENT_VERSIONS = {
  dpa: "2026-08-07",
  privacy: "2026-08-07",
  terms: "2026-08-06",
} as const;

export type LegalAcceptance = {
  legalAcceptedAt: Date | null;
  legalDpaVersion: string | null;
  legalPrivacyVersion: string | null;
  legalTermsVersion: string | null;
};

export function buildLegalAcceptance(acceptedAt: Date | null): LegalAcceptance {
  if (!acceptedAt) {
    return {
      legalAcceptedAt: null,
      legalDpaVersion: null,
      legalPrivacyVersion: null,
      legalTermsVersion: null,
    };
  }

  return {
    legalAcceptedAt: acceptedAt,
    legalDpaVersion: LEGAL_DOCUMENT_VERSIONS.dpa,
    legalPrivacyVersion: LEGAL_DOCUMENT_VERSIONS.privacy,
    legalTermsVersion: LEGAL_DOCUMENT_VERSIONS.terms,
  };
}
