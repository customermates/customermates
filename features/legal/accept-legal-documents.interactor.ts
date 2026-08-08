import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EventService } from "@/features/event/event.service";
import type { LegalAuditRepo } from "./legal-audit.repo";

import { z } from "zod";
import { getLocale } from "next-intl/server";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { ForbiddenError } from "@/core/errors/app-errors";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { hasValidLegalNoticeEffectiveAt } from "./legal-audit.repo";
import {
  CONTRACT_LEGAL_DOCUMENTS,
  currentLegalDocumentVersions,
  hasCurrentLegalDocumentVersions,
} from "@/constants/legal-documents";
import { env } from "@/env";

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
      throw new ForbiddenError("Only a managed-cloud system administrator may accept legal documents");

    const locale = (await getLocale()) === "de" ? "de" : "en";

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
    if (!currentNotice) throw new ForbiddenError("The current legal update has not been delivered to the company");

    await this.eventService.publish(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, {
      entityId: this.companyId,
      payload: {
        versions: currentLegalDocumentVersions(),
        acceptingEmail: this.user.email,
        locale,
        acceptanceType: "later-update",
      },
    });

    return { ok: true as const, data };
  }
}
