import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EventService } from "@/features/event/event.service";
import type { UserService } from "@/features/user/user.service";
import type { LegalAuditRepo } from "./get-legal-status.interactor";

import { z } from "zod";
import { getLocale } from "next-intl/server";

import { ForbiddenError } from "@/core/errors/app-errors";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import {
  CONTRACT_LEGAL_DOCUMENTS,
  LEGAL_CONTRACT_KEY,
  LEGAL_INFORMATION_KEY,
  currentLegalDocumentVersions,
} from "@/constants/legal-documents";
import { env } from "@/env";

import { legalNoticePayload } from "./get-legal-status.interactor";

const Schema = z.object({
  agreeToLegalDocuments: z.literal(true),
});
export type AcceptLegalDocumentsData = Data<typeof Schema>;

export class AcceptLegalDocumentsInteractor {
  constructor(
    private userService: UserService,
    private auditRepo: LegalAuditRepo,
    private eventService: EventService,
  ) {}

  @Validate(Schema)
  @ValidateOutput(Schema)
  async invoke(data: AcceptLegalDocumentsData): Validated<AcceptLegalDocumentsData> {
    const user = await this.userService.getActiveUserOrThrow();
    if (env.APP_MODE !== "cloud" || !user.role?.isSystemRole)
      throw new ForbiddenError("Only a managed-cloud system administrator may accept legal documents");
    const locale = (await getLocale()) === "de" ? "de" : "en";

    return runWithTenant(user, () =>
      runInTransaction(
        async () => {
          const existing = await this.auditRepo.findLegalEventUnscoped({
            companyId: user.companyId,
            event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
            entityId: LEGAL_CONTRACT_KEY,
            order: "desc",
          });
          if (existing) return { ok: true as const, data };

          const noticeRecord = await this.auditRepo.findLegalEventUnscoped({
            companyId: user.companyId,
            event: DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
            entityId: LEGAL_CONTRACT_KEY,
            order: "asc",
          });
          const notice = legalNoticePayload(noticeRecord);
          if (!notice) throw new ForbiddenError("The current legal update has not been delivered to the company");

          await this.eventService.publish(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, {
            entityId: LEGAL_CONTRACT_KEY,
            payload: {
              versions: currentLegalDocumentVersions(),
              contractKey: LEGAL_CONTRACT_KEY,
              informationKey: LEGAL_INFORMATION_KEY,
              changedDocuments:
                notice.changedDocuments.length > 0 ? notice.changedDocuments : [...CONTRACT_LEGAL_DOCUMENTS],
              acceptingUser: { id: user.id, email: user.email },
              locale,
              noticeAt: notice.noticeAt,
              effectiveAt: notice.effectiveAt ?? new Date().toISOString(),
              providerMessageId: notice.providerMessageId,
              deployedGitCommit: notice.deployedGitCommit,
              acceptanceType: "later-update",
            },
          });

          return { ok: true as const, data };
        },
        { companyId: user.companyId },
      ),
    );
  }
}
