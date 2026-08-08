import type { LegalAuditRepo } from "@/features/legal/legal-audit.repo";

import { CONTRACT_LEGAL_DOCUMENTS, hasCurrentLegalDocumentVersions } from "@/constants/legal-documents";
import { UserAccessor } from "@/core/base/user-accessor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { hasValidLegalNoticeEffectiveAt } from "@/features/legal/legal-audit.schema";
import { env } from "@/env";

export type LegalUpdateStatus = {
  contractAccepted: boolean;
  contractNoticeSent: boolean;
  effectiveAt: string | null;
  isSystemAdministrator: boolean;
  mustAccept: boolean;
};

const NO_LEGAL_UPDATE: Omit<LegalUpdateStatus, "isSystemAdministrator"> = {
  contractAccepted: false,
  contractNoticeSent: false,
  effectiveAt: null,
  mustAccept: false,
};

@AllowInDemoMode
@TenantInteractor()
export class GetLegalStatusInteractor extends UserAccessor {
  constructor(private repo: LegalAuditRepo) {
    super();
  }

  async invoke(): Promise<LegalUpdateStatus> {
    const isSystemAdministrator = this.user.role?.isSystemRole === true;
    if (env.APP_MODE !== "cloud") return { ...NO_LEGAL_UPDATE, isSystemAdministrator };

    const records = await this.repo.findLegalEventsUnscoped(this.companyId);
    const contractAccepted = records.some(
      (record) =>
        record.event === DomainEvent.LEGAL_DOCUMENTS_ACCEPTED &&
        record.entityId === this.companyId &&
        hasCurrentLegalDocumentVersions(record.payload?.versions, CONTRACT_LEGAL_DOCUMENTS),
    );

    const noticeRecords = records.filter((record) => record.event === DomainEvent.LEGAL_NOTICE_SENT);
    const currentContractNoticeRecords = noticeRecords.filter(
      (record) =>
        hasValidLegalNoticeEffectiveAt(record.payload) &&
        hasCurrentLegalDocumentVersions(record.payload?.versions, CONTRACT_LEGAL_DOCUMENTS) &&
        record.payload.changedDocuments.some((document) =>
          CONTRACT_LEGAL_DOCUMENTS.some((contractDocument) => contractDocument === document),
        ),
    );
    const contractNoticeSent = currentContractNoticeRecords.length > 0;
    const contractEffectiveAt =
      currentContractNoticeRecords.reduce<{
        createdAt: Date;
        effectiveAt: Date;
      } | null>((current, record) => {
        if (!record.payload?.effectiveAt) return current;

        const effectiveAt = new Date(record.payload.effectiveAt);
        if (Number.isNaN(effectiveAt.getTime())) return current;
        if (current && current.createdAt <= record.createdAt) return current;

        return { createdAt: record.createdAt, effectiveAt };
      }, null)?.effectiveAt ?? null;
    const mustAccept =
      contractNoticeSent && !contractAccepted && contractEffectiveAt !== null && new Date() >= contractEffectiveAt;

    return {
      contractAccepted,
      contractNoticeSent,
      effectiveAt: contractAccepted ? null : (contractEffectiveAt?.toISOString() ?? null),
      isSystemAdministrator,
      mustAccept,
    };
  }
}
