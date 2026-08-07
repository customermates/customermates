import type { TenantUser } from "@/features/user/user.schema";
import type { Prisma } from "@/generated/prisma";
import type { LegalAcceptanceAuditPayload, LegalDocument, LegalNoticeAuditPayload } from "@/constants/legal-documents";

import { DomainEvent } from "@/features/event/domain-events";
import { LEGAL_CONTRACT_KEY, LEGAL_INFORMATION_KEY } from "@/constants/legal-documents";
import { env } from "@/env";

export type LegalAuditRecord = {
  createdAt: Date;
  entityId: string;
  eventData: Prisma.JsonValue;
  userId: string;
};

export abstract class LegalAuditRepo {
  abstract findLegalEventUnscoped(args: {
    companyId: string;
    event: DomainEvent;
    entityId?: string;
    excludeEntityId?: string;
    userId?: string;
    order?: "asc" | "desc";
  }): Promise<LegalAuditRecord | null>;
}

export type LegalUpdateStatus = {
  contractAccepted: boolean;
  contractNoticeSent: boolean;
  contractChangedDocuments: LegalDocument[];
  effectiveAt: string | null;
  informationNoticeVisible: boolean;
  informationChangedDocuments: LegalDocument[];
  isSystemAdministrator: boolean;
  mustAccept: boolean;
};

const NO_LEGAL_UPDATE: Omit<LegalUpdateStatus, "isSystemAdministrator"> = {
  contractAccepted: false,
  contractNoticeSent: false,
  contractChangedDocuments: [],
  effectiveAt: null,
  informationNoticeVisible: false,
  informationChangedDocuments: [],
  mustAccept: false,
};

export function legalNoticePayload(record: LegalAuditRecord | null): LegalNoticeAuditPayload | null {
  const eventData = record?.eventData;
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData) || !("payload" in eventData)) return null;
  return eventData.payload as LegalNoticeAuditPayload;
}

export function legalAcceptancePayload(record: LegalAuditRecord | null): LegalAcceptanceAuditPayload | null {
  const eventData = record?.eventData;
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData) || !("payload" in eventData)) return null;
  return eventData.payload as LegalAcceptanceAuditPayload;
}

function dateFromIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export class GetLegalStatusInteractor {
  constructor(private repo: LegalAuditRepo) {}

  async invoke(user: TenantUser, now = new Date()): Promise<LegalUpdateStatus> {
    const isSystemAdministrator = user.role?.isSystemRole === true;
    if (env.APP_MODE !== "cloud") return { ...NO_LEGAL_UPDATE, isSystemAdministrator };

    const [acceptanceRecord, contractNoticeRecord, informationNoticeRecord] = await Promise.all([
      this.repo.findLegalEventUnscoped({
        companyId: user.companyId,
        event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
        entityId: LEGAL_CONTRACT_KEY,
        order: "desc",
      }),
      this.repo.findLegalEventUnscoped({
        companyId: user.companyId,
        event: DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
        entityId: LEGAL_CONTRACT_KEY,
        order: "asc",
      }),
      this.repo.findLegalEventUnscoped({
        companyId: user.companyId,
        event: DomainEvent.LEGAL_INFORMATION_NOTICE_SENT,
        entityId: LEGAL_INFORMATION_KEY,
        userId: user.id,
        order: "desc",
      }),
    ]);

    const acceptance = legalAcceptancePayload(acceptanceRecord);
    const contractNotice = legalNoticePayload(contractNoticeRecord);
    const informationNotice = legalNoticePayload(informationNoticeRecord);
    const contractAccepted = acceptance?.contractKey === LEGAL_CONTRACT_KEY;
    const contractNoticeSent = contractNotice !== null;
    const effectiveAt = dateFromIso(contractNotice?.effectiveAt);
    const mustAccept = contractNoticeSent && !contractAccepted && effectiveAt !== null && now >= effectiveAt;

    const informationVisibleUntil = dateFromIso(informationNotice?.noticeAt);
    if (informationVisibleUntil) informationVisibleUntil.setUTCDate(informationVisibleUntil.getUTCDate() + 14);

    const initialAcceptanceIsCurrent =
      acceptance?.acceptanceType === "initial-onboarding" && acceptance.informationKey === LEGAL_INFORMATION_KEY;
    const administratorAcceptedCurrentInformation =
      isSystemAdministrator && contractAccepted && acceptance?.informationKey === LEGAL_INFORMATION_KEY;
    const informationAcknowledged = initialAcceptanceIsCurrent || administratorAcceptedCurrentInformation;
    const informationNoticeVisible =
      informationNotice !== null &&
      !informationAcknowledged &&
      informationVisibleUntil !== null &&
      now < informationVisibleUntil;

    return {
      contractAccepted,
      contractNoticeSent,
      contractChangedDocuments: contractNotice?.changedDocuments ?? [],
      effectiveAt: effectiveAt?.toISOString() ?? null,
      informationNoticeVisible,
      informationChangedDocuments: informationNotice?.changedDocuments ?? [],
      isSystemAdministrator,
      mustAccept,
    };
  }
}
