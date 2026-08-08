import type { LegalDocument } from "@/constants/legal-documents";
import type { LegalAuditRecord, LegalAuditRepo } from "@/features/legal/legal-audit.repo";
import type { TenantUser } from "@/features/user/user.schema";

import {
  CONTRACT_LEGAL_DOCUMENTS,
  INFORMATION_LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_VERSIONS,
  hasCurrentLegalDocumentVersions,
} from "@/constants/legal-documents";
import { DomainEvent } from "@/features/event/domain-events";
import { hasValidLegalNoticeEffectiveAt } from "@/features/legal/legal-audit.repo";
import { env } from "@/env";

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

export class GetLegalStatusInteractor {
  constructor(private repo: LegalAuditRepo) {}

  async invoke(user: TenantUser, now = new Date()): Promise<LegalUpdateStatus> {
    const isSystemAdministrator = user.role?.isSystemRole === true;
    if (env.APP_MODE !== "cloud") return { ...NO_LEGAL_UPDATE, isSystemAdministrator };

    const records = await this.repo.findLegalEventsUnscoped(user.companyId);
    const acceptanceRecord = this.latest(
      records.filter(
        (record) =>
          record.event === DomainEvent.LEGAL_DOCUMENTS_ACCEPTED &&
          record.entityId === user.companyId &&
          hasCurrentLegalDocumentVersions(record.payload?.versions, CONTRACT_LEGAL_DOCUMENTS),
      ),
    );
    const contractAccepted = acceptanceRecord !== null;
    const initialAcceptanceRecord = this.latest(
      records.filter(
        (record) =>
          record.event === DomainEvent.LEGAL_DOCUMENTS_ACCEPTED &&
          record.userId === user.id &&
          record.payload?.acceptanceType === "initial-onboarding",
      ),
    );

    const noticeRecords = records.filter((record) => record.event === DomainEvent.LEGAL_NOTICE_SENT);
    const currentContractNoticeRecords = noticeRecords.filter(
      (record) =>
        hasValidLegalNoticeEffectiveAt(record.payload) &&
        hasCurrentLegalDocumentVersions(record.payload?.versions, CONTRACT_LEGAL_DOCUMENTS) &&
        this.includesAny(record.payload?.changedDocuments, CONTRACT_LEGAL_DOCUMENTS),
    );
    const contractNoticeSent = currentContractNoticeRecords.length > 0;
    const contractEffectiveAt = this.earliestValidEffectiveAt(currentContractNoticeRecords);
    const mustAccept =
      contractNoticeSent && !contractAccepted && contractEffectiveAt !== null && now >= contractEffectiveAt;

    const informationDocuments = isSystemAdministrator ? INFORMATION_LEGAL_DOCUMENTS : (["privacy"] as const);
    const informationNoticeRecord = this.latest(
      noticeRecords.filter(
        (record) =>
          record.entityId === user.id &&
          informationDocuments.some(
            (document) =>
              record.payload?.changedDocuments.includes(document) === true &&
              record.payload.versions?.[document] === LEGAL_DOCUMENT_VERSIONS[document] &&
              (document !== "subprocessors" || hasValidLegalNoticeEffectiveAt(record.payload)),
          ),
      ),
    );
    const informationNotice = informationNoticeRecord?.payload;
    const informationVisibleUntil = informationNoticeRecord
      ? new Date(informationNoticeRecord.createdAt.getTime() + 14 * 86_400_000)
      : null;
    const informationAcknowledged = hasCurrentLegalDocumentVersions(
      initialAcceptanceRecord?.payload?.versions,
      informationDocuments,
    );
    const informationNoticeVisible =
      informationNotice !== null &&
      informationNotice !== undefined &&
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

  private includesAny(
    changedDocuments: readonly LegalDocument[] | null | undefined,
    documents: readonly LegalDocument[],
  ): boolean {
    return changedDocuments?.some((document) => documents.includes(document)) === true;
  }

  private latest(records: LegalAuditRecord[]): LegalAuditRecord | null {
    return records.reduce<LegalAuditRecord | null>(
      (current, record) => (!current || record.createdAt > current.createdAt ? record : current),
      null,
    );
  }

  private earliestValidEffectiveAt(records: LegalAuditRecord[]): Date | null {
    return (
      records.reduce<{ createdAt: Date; effectiveAt: Date } | null>((current, record) => {
        if (record.event !== DomainEvent.LEGAL_NOTICE_SENT || !record.payload?.effectiveAt) return current;

        const effectiveAt = new Date(record.payload.effectiveAt);
        if (Number.isNaN(effectiveAt.getTime())) return current;
        if (current && current.createdAt <= record.createdAt) return current;

        return { createdAt: record.createdAt, effectiveAt };
      }, null)?.effectiveAt ?? null
    );
  }
}
