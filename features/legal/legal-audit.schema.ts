import type { DomainEvent } from "@/features/event/domain-events";

import { z } from "zod";

import { ALL_LEGAL_DOCUMENTS } from "@/constants/legal-documents";

const LegalDocumentVersionsSchema = z.object({
  dpa: z.iso.date(),
  privacy: z.iso.date(),
  subprocessors: z.iso.date(),
  terms: z.iso.date(),
});

export const LegalNoticeAuditPayloadSchema = z.object({
  versions: LegalDocumentVersionsSchema,
  changedDocuments: z.array(z.enum(ALL_LEGAL_DOCUMENTS)).min(1),
  recipientEmail: z.string().min(1),
  effectiveAt: z.iso.datetime().nullable(),
});

export const LegalAcceptanceAuditPayloadSchema = z.object({
  versions: LegalDocumentVersionsSchema,
  acceptingEmail: z.string().min(1),
  acceptanceType: z.enum(["initial-onboarding", "later-update"]),
});

export type LegalNoticeAuditPayload = z.infer<typeof LegalNoticeAuditPayloadSchema>;
export type LegalAcceptanceAuditPayload = z.infer<typeof LegalAcceptanceAuditPayloadSchema>;

type LegalAuditRecordBase = {
  createdAt: Date;
  entityId: string;
  userId: string;
};

export type LegalAuditRecord =
  | (LegalAuditRecordBase & {
      event: DomainEvent.LEGAL_NOTICE_SENT;
      payload: LegalNoticeAuditPayload | null;
    })
  | (LegalAuditRecordBase & {
      event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED;
      payload: LegalAcceptanceAuditPayload | null;
    });

export function hasValidLegalNoticeEffectiveAt(
  payload: LegalNoticeAuditPayload | null | undefined,
): payload is LegalNoticeAuditPayload & { effectiveAt: string } {
  if (!payload?.effectiveAt) return false;
  return !Number.isNaN(new Date(payload.effectiveAt).getTime());
}
