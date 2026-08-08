import type { LegalAcceptanceAuditPayload, LegalNoticeAuditPayload } from "@/constants/legal-documents";

import { z } from "zod";

import { ALL_LEGAL_DOCUMENTS } from "@/constants/legal-documents";
import type { DomainEvent } from "@/features/event/domain-events";

const LegalDocumentVersionsSchema = z.object({
  dpa: z.iso.date(),
  privacy: z.iso.date(),
  subprocessors: z.iso.date(),
  terms: z.iso.date(),
});

const LegalNoticeAuditPayloadSchema = z.object({
  versions: LegalDocumentVersionsSchema,
  changedDocuments: z.array(z.enum(ALL_LEGAL_DOCUMENTS)).min(1),
  recipientEmail: z.string().min(1),
  locale: z.string().min(1),
  effectiveAt: z.iso.datetime().nullable(),
});

const LegalAcceptanceAuditPayloadSchema = z.object({
  versions: LegalDocumentVersionsSchema,
  acceptingEmail: z.string().min(1),
  locale: z.string().min(1),
  acceptanceType: z.enum(["initial-onboarding", "later-update"]),
});

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

export abstract class LegalAuditRepo {
  abstract findLegalEventsUnscoped(companyId: string): Promise<LegalAuditRecord[]>;
}

export function parseLegalNoticeAuditPayload(value: unknown): LegalNoticeAuditPayload | null {
  const parsed = LegalNoticeAuditPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseLegalAcceptanceAuditPayload(value: unknown): LegalAcceptanceAuditPayload | null {
  const parsed = LegalAcceptanceAuditPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function hasValidLegalNoticeEffectiveAt(
  payload: LegalNoticeAuditPayload | null | undefined,
): payload is LegalNoticeAuditPayload & { effectiveAt: string } {
  if (!payload?.effectiveAt) return false;
  return !Number.isNaN(new Date(payload.effectiveAt).getTime());
}
