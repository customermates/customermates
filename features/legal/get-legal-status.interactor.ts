import type { TenantUser } from "@/features/user/user.schema";
import type { Prisma } from "@/generated/prisma";
import type { LegalAcceptanceAuditPayload, LegalDocument, LegalNoticeAuditPayload } from "@/constants/legal-documents";

import {
  CONTRACT_LEGAL_DOCUMENTS,
  INFORMATION_LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_VERSIONS,
} from "@/constants/legal-documents";
import { DomainEvent } from "@/features/event/domain-events";
import { env } from "@/env";

export type LegalAuditRecord = {
  createdAt: Date;
  entityId: string;
  event: DomainEvent;
  eventData: Prisma.JsonValue;
  userId: string;
};

export abstract class LegalAuditRepo {
  abstract findLegalEventsUnscoped(companyId: string): Promise<LegalAuditRecord[]>;
}

export type LegalUpdateStatus = {
  contractAccepted: boolean;
  contractNoticeSent: boolean;
  effectiveAt: string | null;
  informationNoticeVisible: boolean;
  isSystemAdministrator: boolean;
  mustAccept: boolean;
};

const NO_LEGAL_UPDATE: Omit<LegalUpdateStatus, "isSystemAdministrator"> = {
  contractAccepted: false,
  contractNoticeSent: false,
  effectiveAt: null,
  informationNoticeVisible: false,
  mustAccept: false,
};

function eventPayload(record: LegalAuditRecord | null): unknown {
  const eventData = record?.eventData;
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData) || !("payload" in eventData)) return null;
  return eventData.payload;
}

export function legalNoticePayload(record: LegalAuditRecord | null): LegalNoticeAuditPayload | null {
  return eventPayload(record) as LegalNoticeAuditPayload | null;
}

export function legalAcceptancePayload(record: LegalAuditRecord | null): LegalAcceptanceAuditPayload | null {
  return eventPayload(record) as LegalAcceptanceAuditPayload | null;
}

export function hasCurrentLegalVersions(
  payload: LegalNoticeAuditPayload | LegalAcceptanceAuditPayload | null,
  documents: readonly LegalDocument[],
): boolean {
  return (
    payload !== null &&
    documents.every((document) => payload.versions?.[document] === LEGAL_DOCUMENT_VERSIONS[document])
  );
}

export function noticeIncludesAny(
  payload: LegalNoticeAuditPayload | null,
  documents: readonly LegalDocument[],
): boolean {
  return payload !== null && payload.changedDocuments.some((document) => documents.includes(document));
}

function dateFromIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latest(records: LegalAuditRecord[]): LegalAuditRecord | null {
  return records.reduce<LegalAuditRecord | null>(
    (current, record) => (!current || record.createdAt > current.createdAt ? record : current),
    null,
  );
}

export class GetLegalStatusInteractor {
  constructor(private repo: LegalAuditRepo) {}

  async invoke(user: TenantUser, now = new Date()): Promise<LegalUpdateStatus> {
    const isSystemAdministrator = user.role?.isSystemRole === true;
    if (env.APP_MODE !== "cloud") return { ...NO_LEGAL_UPDATE, isSystemAdministrator };

    const records = await this.repo.findLegalEventsUnscoped(user.companyId);
    const acceptanceRecord = latest(
      records.filter((record) => {
        if (record.event !== DomainEvent.LEGAL_DOCUMENTS_ACCEPTED || record.entityId !== user.companyId) return false;
        return hasCurrentLegalVersions(legalAcceptancePayload(record), CONTRACT_LEGAL_DOCUMENTS);
      }),
    );
    const acceptance = legalAcceptancePayload(acceptanceRecord);
    const contractAccepted = acceptance !== null;
    const initialAcceptanceRecord = latest(
      records.filter((record) => {
        if (record.event !== DomainEvent.LEGAL_DOCUMENTS_ACCEPTED || record.userId !== user.id) return false;
        return legalAcceptancePayload(record)?.acceptanceType === "initial-onboarding";
      }),
    );
    const initialAcceptance = legalAcceptancePayload(initialAcceptanceRecord);

    const noticeRecords = records.filter((record) => record.event === DomainEvent.LEGAL_NOTICE_SENT);
    const contractNoticeRecord = noticeRecords.find((record) => {
      const payload = legalNoticePayload(record);
      return (
        hasCurrentLegalVersions(payload, CONTRACT_LEGAL_DOCUMENTS) &&
        noticeIncludesAny(payload, CONTRACT_LEGAL_DOCUMENTS)
      );
    });
    const contractNotice = legalNoticePayload(contractNoticeRecord ?? null);
    const contractNoticeSent = contractNotice !== null;
    const contractEffectiveAt = dateFromIso(contractNotice?.effectiveAt);
    const mustAccept =
      contractNoticeSent && !contractAccepted && contractEffectiveAt !== null && now >= contractEffectiveAt;

    const informationDocuments = isSystemAdministrator ? INFORMATION_LEGAL_DOCUMENTS : (["privacy"] as const);
    const informationNoticeRecord = latest(
      noticeRecords.filter((record) => {
        if (record.entityId !== user.id) return false;
        const payload = legalNoticePayload(record);
        return informationDocuments.some(
          (document) =>
            payload?.changedDocuments.includes(document) === true &&
            payload.versions?.[document] === LEGAL_DOCUMENT_VERSIONS[document],
        );
      }),
    );
    const informationNotice = legalNoticePayload(informationNoticeRecord);
    const informationVisibleUntil = informationNoticeRecord
      ? new Date(informationNoticeRecord.createdAt.getTime() + 14 * 86_400_000)
      : null;
    const informationAcknowledged = hasCurrentLegalVersions(initialAcceptance, informationDocuments);
    const informationNoticeVisible =
      informationNotice !== null &&
      !informationAcknowledged &&
      informationVisibleUntil !== null &&
      now < informationVisibleUntil;

    return {
      contractAccepted,
      contractNoticeSent,
      effectiveAt: contractAccepted ? null : (contractEffectiveAt?.toISOString() ?? null),
      informationNoticeVisible,
      isSystemAdministrator,
      mustAccept,
    };
  }
}
