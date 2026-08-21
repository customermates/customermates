import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EventService } from "@/features/event/event.service";
import type { LegalAuditRepo } from "./legal-audit.repo";

import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { hasValidLegalNoticeEffectiveAt } from "./legal-audit.schema";
import {
  CONTRACT_LEGAL_DOCUMENTS,
  currentLegalDocumentVersions,
  hasCurrentLegalDocumentVersions,
} from "@/constants/legal-documents";
import { env } from "@/env";
import { createInteractorFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = z.object({
  agreeToLegalDocuments: z.literal(true),
});
export type AcceptLegalDocumentsData = Data<typeof Schema>;

@TenantInteractor()
export class AcceptLegalDocumentsInteractor extends AuthenticatedInteractor<
  AcceptLegalDocumentsData,
  AcceptLegalDocumentsData
> {
  constructor(
    private auditRepo: LegalAuditRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({ input: Schema, output: Schema })
  async invoke(data: AcceptLegalDocumentsData): Validated<AcceptLegalDocumentsData> {
    if (env.APP_MODE !== "cloud" || !this.user.role?.isSystemRole)
      return createInteractorFailure(CustomErrorCode.permissionDenied);

    const records = await this.auditRepo.findLegalEventsUnscoped(this.companyId);
    const existing = records.find(
      (record) =>
        record.event === DomainEvent.LEGAL_DOCUMENTS_ACCEPTED &&
        record.entityId === this.companyId &&
        hasCurrentLegalDocumentVersions(record.payload?.versions, CONTRACT_LEGAL_DOCUMENTS),
    );
    if (existing) return { ok: true as const, data };

    const currentNotice = records.find(
      (record) =>
        record.event === DomainEvent.LEGAL_NOTICE_SENT &&
        hasValidLegalNoticeEffectiveAt(record.payload) &&
        hasCurrentLegalDocumentVersions(record.payload?.versions, CONTRACT_LEGAL_DOCUMENTS) &&
        record.payload?.changedDocuments.some((document) =>
          CONTRACT_LEGAL_DOCUMENTS.some((contractDocument) => contractDocument === document),
        ) === true,
    );
    if (!currentNotice) return createInteractorFailure(CustomErrorCode.legalNoticeNotDelivered);

    await this.eventService.publish(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, {
      entityId: this.companyId,
      payload: {
        versions: currentLegalDocumentVersions(),
        acceptingEmail: this.user.email,
        acceptanceType: "later-update",
      },
    });

    return { ok: true as const, data };
  }
}
