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
import { CONTRACT_LEGAL_DOCUMENTS, currentLegalDocumentVersions } from "@/constants/legal-documents";
import { env } from "@/env";

import {
  hasCurrentLegalVersions,
  legalAcceptancePayload,
  legalNoticePayload,
  noticeIncludesAny,
} from "./get-legal-status.interactor";

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
          const records = await this.auditRepo.findLegalEventsUnscoped(user.companyId);
          const existing = records.find(
            (record) =>
              record.event === DomainEvent.LEGAL_DOCUMENTS_ACCEPTED &&
              record.entityId === user.companyId &&
              hasCurrentLegalVersions(legalAcceptancePayload(record), CONTRACT_LEGAL_DOCUMENTS),
          );
          if (existing) return { ok: true as const, data };

          const currentNotice = records.find((record) => {
            if (record.event !== DomainEvent.LEGAL_NOTICE_SENT) return false;
            const payload = legalNoticePayload(record);
            return (
              hasCurrentLegalVersions(payload, CONTRACT_LEGAL_DOCUMENTS) &&
              noticeIncludesAny(payload, CONTRACT_LEGAL_DOCUMENTS)
            );
          });
          if (!currentNotice)
            throw new ForbiddenError("The current legal update has not been delivered to the company");

          await this.eventService.publish(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, {
            entityId: user.companyId,
            payload: {
              versions: currentLegalDocumentVersions(),
              acceptingEmail: user.email,
              locale,
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
