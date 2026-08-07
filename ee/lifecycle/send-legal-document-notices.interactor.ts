import type { EmailService } from "@/features/email/email.service";
import type { EventService } from "@/features/event/event.service";
import type { LegalAuditRecord } from "@/features/legal/get-legal-status.interactor";
import type { LegalDocument, LegalDocumentVersions } from "@/constants/legal-documents";

import type { Locale } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { DomainEvent } from "@/features/event/domain-events";
import { getLegalDeploymentCommit } from "@/features/legal/legal-deployment-commit";
import {
  CONTRACT_LEGAL_DOCUMENTS,
  INFORMATION_LEGAL_DOCUMENTS,
  LEGAL_CONTRACT_KEY,
  LEGAL_DOCUMENT_VERSIONS,
  LEGAL_INFORMATION_KEY,
  currentLegalDocumentVersions,
} from "@/constants/legal-documents";
import {
  LegalAuditRepo,
  legalAcceptancePayload,
  legalNoticePayload,
} from "@/features/legal/get-legal-status.interactor";
import { resolveUserLocale } from "@/i18n/user-locale";
import { getTranslator } from "@/i18n/get-translator";
import { env } from "@/env";

import LegalDocumentNotice from "@/components/emails/legal-document-notice";

const DAY_MS = 86_400_000;

export type LegalNoticeRecipient = {
  id: string;
  companyId: string;
  email: string;
  firstName: string;
  displayLanguage: Locale;
  isSystemAdministrator: boolean;
};

export abstract class SendLegalDocumentNoticesRepo {
  abstract findActiveLegalNoticeRecipientsUnscoped(): Promise<LegalNoticeRecipient[]>;
}

export abstract class SendLegalDocumentNoticesAuditRepo extends LegalAuditRepo {
  abstract findLegalEventsUnscoped(args: {
    companyId: string;
    event: DomainEvent;
    entityId: string;
    userId?: string;
  }): Promise<LegalAuditRecord[]>;
}

function recordVersions(record: LegalAuditRecord | null): LegalDocumentVersions | null {
  return legalNoticePayload(record)?.versions ?? legalAcceptancePayload(record)?.versions ?? null;
}

function newerRecord(a: LegalAuditRecord | null, b: LegalAuditRecord | null): LegalAuditRecord | null {
  if (!a) return b;
  if (!b) return a;
  return a.createdAt >= b.createdAt ? a : b;
}

function changedSince(documents: readonly LegalDocument[], baseline: LegalDocumentVersions | null): LegalDocument[] {
  if (!baseline) return [...documents];
  return documents.filter((document) => baseline[document] !== LEGAL_DOCUMENT_VERSIONS[document]);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

@SystemInteractor
export class SendLegalDocumentNoticesInteractor {
  constructor(
    private recipientRepo: SendLegalDocumentNoticesRepo,
    private auditRepo: SendLegalDocumentNoticesAuditRepo,
    private emailService: EmailService,
    private eventService: EventService,
  ) {}

  async invoke(now = new Date()): Promise<void> {
    if (env.APP_MODE !== "cloud") return;

    const recipients = await this.recipientRepo.findActiveLegalNoticeRecipientsUnscoped();
    const companies = new Map<string, LegalNoticeRecipient[]>();
    for (const recipient of recipients) {
      const companyRecipients = companies.get(recipient.companyId) ?? [];
      companyRecipients.push(recipient);
      companies.set(recipient.companyId, companyRecipients);
    }

    const failures: unknown[] = [];
    for (const [companyId, companyRecipients] of companies) {
      try {
        await this.sendCompanyNotices(
          companyId,
          companyRecipients.sort((a, b) => Number(b.isSystemAdministrator) - Number(a.isSystemAdministrator)),
          now,
        );
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `Legal notice processing failed: ${failures.map((failure) => String(failure)).join("; ")}`,
      );
    }
  }

  private async sendCompanyNotices(companyId: string, recipients: LegalNoticeRecipient[], now: Date): Promise<void> {
    const failures: unknown[] = [];
    const [
      currentAcceptanceRecord,
      firstAcceptanceRecord,
      currentContractNotice,
      currentInformationNotices,
      latestContractNotice,
      latestAcceptance,
    ] = await Promise.all([
      this.auditRepo.findLegalEventUnscoped({
        companyId,
        event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
        entityId: LEGAL_CONTRACT_KEY,
        order: "desc",
      }),
      this.auditRepo.findLegalEventUnscoped({
        companyId,
        event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
        order: "asc",
      }),
      this.auditRepo.findLegalEventUnscoped({
        companyId,
        event: DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
        entityId: LEGAL_CONTRACT_KEY,
        order: "asc",
      }),
      this.auditRepo.findLegalEventsUnscoped({
        companyId,
        event: DomainEvent.LEGAL_INFORMATION_NOTICE_SENT,
        entityId: LEGAL_INFORMATION_KEY,
      }),
      this.auditRepo.findLegalEventUnscoped({
        companyId,
        event: DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
        order: "desc",
      }),
      this.auditRepo.findLegalEventUnscoped({
        companyId,
        event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
        order: "desc",
      }),
    ]);

    const currentAcceptance = legalAcceptancePayload(currentAcceptanceRecord);
    const initialContractAcceptanceIsCurrent =
      currentAcceptance?.acceptanceType === "initial-onboarding" &&
      currentAcceptance.contractKey === LEGAL_CONTRACT_KEY;
    const contractAlreadyAccepted =
      currentAcceptance?.acceptanceType === "later-update" && currentAcceptance.contractKey === LEGAL_CONTRACT_KEY;
    const initialAcceptance = legalAcceptancePayload(firstAcceptanceRecord);
    const initialInformationBaseline =
      initialAcceptance?.acceptanceType === "initial-onboarding" ? firstAcceptanceRecord : null;
    const contractBaseline = newerRecord(latestContractNotice, latestAcceptance);
    const existingContractNoticePayload = legalNoticePayload(currentContractNotice);
    const contractChangedDocuments = existingContractNoticePayload
      ? existingContractNoticePayload.changedDocuments.filter((document) =>
          CONTRACT_LEGAL_DOCUMENTS.includes(document as (typeof CONTRACT_LEGAL_DOCUMENTS)[number]),
        )
      : changedSince(CONTRACT_LEGAL_DOCUMENTS, recordVersions(contractBaseline));
    const existingInformationNoticePayload =
      currentInformationNotices
        .map(legalNoticePayload)
        .find(
          (payload) => payload?.effectiveAt !== null && payload?.changedDocuments.includes("subprocessors") === true,
        ) ?? null;
    let contractEffectiveAt = existingContractNoticePayload?.effectiveAt ?? null;
    let informationEffectiveAt = existingInformationNoticePayload?.effectiveAt ?? null;
    const documentsBelongToSeparateReleases =
      (existingContractNoticePayload !== null &&
        existingContractNoticePayload.informationKey !== LEGAL_INFORMATION_KEY) ||
      (existingInformationNoticePayload !== null &&
        existingInformationNoticePayload.contractKey !== LEGAL_CONTRACT_KEY);

    for (const recipient of recipients) {
      const [recipientContractNotice, currentRecipientInformationNotices, previousRecipientInformationNotice] =
        await Promise.all([
          recipient.isSystemAdministrator && !initialContractAcceptanceIsCurrent
            ? this.auditRepo.findLegalEventUnscoped({
                companyId,
                event: DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
                entityId: LEGAL_CONTRACT_KEY,
                userId: recipient.id,
              })
            : Promise.resolve(null),
          this.auditRepo.findLegalEventsUnscoped({
            companyId,
            event: DomainEvent.LEGAL_INFORMATION_NOTICE_SENT,
            entityId: LEGAL_INFORMATION_KEY,
            userId: recipient.id,
          }),
          this.auditRepo.findLegalEventUnscoped({
            companyId,
            event: DomainEvent.LEGAL_INFORMATION_NOTICE_SENT,
            excludeEntityId: LEGAL_INFORMATION_KEY,
            userId: recipient.id,
            order: "desc",
          }),
        ]);

      const needsContract =
        recipient.isSystemAdministrator &&
        !initialContractAcceptanceIsCurrent &&
        recipientContractNotice === null &&
        contractChangedDocuments.length > 0;

      const informationBaseline = newerRecord(previousRecipientInformationNotice, initialInformationBaseline);
      const informationDocumentsForRecipient = recipient.isSystemAdministrator
        ? INFORMATION_LEGAL_DOCUMENTS
        : (["privacy"] as const);
      const alreadyDeliveredInformationDocuments = new Set(
        currentRecipientInformationNotices.flatMap((record) => legalNoticePayload(record)?.changedDocuments ?? []),
      );
      const informationChangedDocuments = changedSince(
        informationDocumentsForRecipient,
        recordVersions(informationBaseline),
      ).filter((document) => !alreadyDeliveredInformationDocuments.has(document));
      const needsInformation = informationChangedDocuments.length > 0;

      if (!needsContract && !needsInformation) continue;

      const batches =
        needsContract && needsInformation && documentsBelongToSeparateReleases
          ? [
              {
                kind: "contract" as const,
                changedDocuments: contractChangedDocuments,
                recordsContract: true,
                recordsInformation: false,
              },
              {
                kind: "information" as const,
                changedDocuments: informationChangedDocuments,
                recordsContract: false,
                recordsInformation: true,
              },
            ]
          : [
              {
                kind:
                  needsContract && needsInformation
                    ? ("combined" as const)
                    : needsContract
                      ? ("contract" as const)
                      : ("information" as const),
                changedDocuments: [
                  ...(needsContract ? contractChangedDocuments : []),
                  ...(needsInformation ? informationChangedDocuments : []),
                ].filter((document, index, documents) => documents.indexOf(document) === index),
                recordsContract: needsContract,
                recordsInformation: needsInformation,
              },
            ];

      for (const batch of batches) {
        const hasSubprocessorObjection =
          recipient.isSystemAdministrator && batch.changedDocuments.includes("subprocessors");
        let effectiveAt: string | null = null;
        if (batch.recordsContract) {
          effectiveAt =
            contractEffectiveAt ??
            (batch.recordsInformation && existingInformationNoticePayload?.contractKey === LEGAL_CONTRACT_KEY
              ? informationEffectiveAt
              : null) ??
            addDays(now, 14).toISOString();
          contractEffectiveAt = effectiveAt;
          if (batch.recordsInformation) informationEffectiveAt ??= effectiveAt;
        } else if (hasSubprocessorObjection) {
          effectiveAt =
            informationEffectiveAt ??
            (existingContractNoticePayload?.informationKey === LEGAL_INFORMATION_KEY ? contractEffectiveAt : null) ??
            addDays(now, 14).toISOString();
          informationEffectiveAt = effectiveAt;
        }

        try {
          const noticeAt = now.toISOString();
          const commit = getLegalDeploymentCommit();
          const locale = resolveUserLocale(recipient);
          const email = await this.buildEmail({
            recipient,
            locale,
            changedDocuments: batch.changedDocuments,
            effectiveAt,
            commit,
            contractAlreadyAccepted,
            needsContract: batch.recordsContract,
          });
          const idempotencyKey = `legal:${companyId}:${recipient.id}:${batch.kind}:${LEGAL_CONTRACT_KEY}:${LEGAL_INFORMATION_KEY}`;
          const sent = await this.emailService.send({ ...email, idempotencyKey });
          const payload = {
            versions: currentLegalDocumentVersions(),
            contractKey: LEGAL_CONTRACT_KEY,
            informationKey: LEGAL_INFORMATION_KEY,
            changedDocuments: batch.changedDocuments,
            recipient: { id: recipient.id, email: recipient.email },
            locale,
            noticeAt,
            effectiveAt,
            providerMessageId: sent.id,
            deployedGitCommit: commit,
            acceptanceType: null,
          } as const;

          await runInTransaction(
            async () => {
              if (batch.recordsContract) {
                await this.eventService.publish(
                  DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
                  { entityId: LEGAL_CONTRACT_KEY, payload },
                  { systemCompanyId: companyId, systemUserId: recipient.id },
                );
              }
              if (batch.recordsInformation) {
                await this.eventService.publish(
                  DomainEvent.LEGAL_INFORMATION_NOTICE_SENT,
                  { entityId: LEGAL_INFORMATION_KEY, payload },
                  { systemCompanyId: companyId, systemUserId: recipient.id },
                );
              }
            },
            { companyId },
          );
        } catch (error) {
          failures.push(error);
        }
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `Legal notice delivery failed for ${companyId}: ${failures.map((failure) => String(failure)).join("; ")}`,
      );
    }
  }

  private async buildEmail(args: {
    recipient: LegalNoticeRecipient;
    locale: Exclude<Locale, "system">;
    changedDocuments: LegalDocument[];
    effectiveAt: string | null;
    commit: string;
    contractAlreadyAccepted: boolean;
    needsContract: boolean;
  }) {
    const t = await getTranslator(args.locale, "LegalDocumentNotice");
    const subject = args.needsContract
      ? args.contractAlreadyAccepted
        ? t("acceptedContractSubject")
        : t("contractSubject")
      : t("informationSubject");
    const documents = args.changedDocuments.map((document) => ({
      name: t(`documents.${document}`),
      version: LEGAL_DOCUMENT_VERSIONS[document],
      liveUrl: `${env.BASE_URL}/${args.locale}/${document}`,
      revisionUrl: `https://github.com/customermates/customermates/blob/${args.commit}/content/legal/${args.locale}/${document}.mdx`,
    }));
    const deadline = args.effectiveAt
      ? new Intl.DateTimeFormat(args.locale, {
          dateStyle: "long",
          timeZone: "UTC",
        }).format(new Date(args.effectiveAt))
      : null;
    const hasSubprocessorObjection = args.changedDocuments.includes("subprocessors");
    const objections = [
      ...(args.needsContract
        ? [args.contractAlreadyAccepted ? t("acceptedContractRecord") : t("contractObjection")]
        : []),
      ...(hasSubprocessorObjection ? [t("subprocessorObjection")] : []),
    ];

    return {
      to: args.recipient.email,
      subject,
      react: LegalDocumentNotice({
        body: args.needsContract
          ? args.contractAlreadyAccepted
            ? t("acceptedContractBody")
            : t("contractBody")
          : t("informationBody"),
        deadline,
        deadlineLabel:
          args.needsContract && !args.contractAlreadyAccepted
            ? t("contractDeadlineLabel")
            : hasSubprocessorObjection
              ? t("subprocessorDeadlineLabel")
              : t("acceptedContractDateLabel"),
        documents,
        greeting: t("greeting", { firstName: args.recipient.firstName }),
        liveLabel: t("liveLabel"),
        objections,
        revisionLabel: t("revisionLabel"),
        signoff: t("signoff"),
        subject,
        title: args.needsContract ? t("contractTitle") : t("informationTitle"),
      }),
    };
  }
}
