import type { EmailService } from "@/features/email/email.service";
import type { EventService } from "@/features/event/event.service";
import type { LegalDocument, LegalDocumentVersions } from "@/constants/legal-documents";
import type { Locale } from "@/generated/prisma";

import LegalDocumentNotice from "@/components/emails/legal-document-notice";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import {
  CONTRACT_LEGAL_DOCUMENTS,
  INFORMATION_LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_VERSIONS,
  SUPPLIER_SUBPROCESSOR_OBJECTION_DEADLINE,
  currentLegalDocumentVersions,
  hasCurrentLegalDocumentVersions,
} from "@/constants/legal-documents";
import { DomainEvent } from "@/features/event/domain-events";
import { hasValidLegalNoticeEffectiveAt, type LegalAuditRecord } from "@/features/legal/legal-audit.schema";
import type { LegalAuditRepo } from "@/features/legal/legal-audit.repo";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";
import { env } from "@/env";

const DAY_IN_MS = 86_400_000;

export type LegalNoticeRecipient = {
  id: string;
  companyId: string;
  createdAt: Date;
  email: string;
  firstName: string;
  displayLanguage: Locale;
  isSystemAdministrator: boolean;
};

export abstract class SendLegalDocumentNoticesRepo {
  abstract findActiveLegalNoticeRecipientsUnscoped(): Promise<LegalNoticeRecipient[]>;
}

type VersionEvidence = {
  createdAt: Date;
  versions: LegalDocumentVersions;
};

type LegalNoticePlan = {
  companyId: string;
  recipient: LegalNoticeRecipient;
  changedDocuments: LegalDocument[];
  effectiveAt: string | null;
  includesContract: boolean;
  subprocessorEffectiveAt: string | null;
};

@SystemInteractor
export class SendLegalDocumentNoticesInteractor {
  constructor(
    private recipientRepo: SendLegalDocumentNoticesRepo,
    private auditRepo: LegalAuditRepo,
    private emailService: EmailService,
    private eventService: EventService,
  ) {}

  async invoke(): Promise<void> {
    if (env.APP_MODE !== "cloud") return;

    const now = new Date();
    const recipients = await this.recipientRepo.findActiveLegalNoticeRecipientsUnscoped();
    const recipientsByCompany = new Map<string, LegalNoticeRecipient[]>();

    for (const recipient of recipients) {
      const companyRecipients = recipientsByCompany.get(recipient.companyId) ?? [];
      companyRecipients.push(recipient);
      recipientsByCompany.set(recipient.companyId, companyRecipients);
    }

    for (const [companyId, companyRecipients] of recipientsByCompany) {
      await this.sendCompanyNotices(
        companyId,
        companyRecipients.sort((a, b) => Number(b.isSystemAdministrator) - Number(a.isSystemAdministrator)),
        now,
        SUPPLIER_SUBPROCESSOR_OBJECTION_DEADLINE,
      );
    }
  }

  private async sendCompanyNotices(
    companyId: string,
    recipients: LegalNoticeRecipient[],
    now: Date,
    configuredSupplierDeadline: string | null,
  ): Promise<void> {
    const records = await this.auditRepo.findLegalEventsUnscoped(companyId);
    const contractAccepted = records.some(
      (record) =>
        record.event === DomainEvent.LEGAL_DOCUMENTS_ACCEPTED &&
        record.entityId === companyId &&
        hasCurrentLegalDocumentVersions(record.payload?.versions, CONTRACT_LEGAL_DOCUMENTS),
    );
    let contractEffectiveAt = this.findCurrentNoticeDeadline(records, CONTRACT_LEGAL_DOCUMENTS);
    let subprocessorEffectiveAt =
      configuredSupplierDeadline === null ? this.findCurrentNoticeDeadline(records, ["subprocessors"]) : null;

    for (const recipient of recipients) {
      const { contractDocuments, informationDocuments } = this.getChangedDocuments(
        records,
        companyId,
        recipient,
        contractAccepted,
      );
      const changedDocuments = [...contractDocuments, ...informationDocuments];
      if (changedDocuments.length === 0) continue;

      const includesContract = contractDocuments.length > 0;
      const includesSubprocessors = informationDocuments.includes("subprocessors");
      let effectiveAt: string | null = null;

      if (includesContract) {
        contractEffectiveAt ??= new Date(now.getTime() + 14 * DAY_IN_MS).toISOString();
        effectiveAt = contractEffectiveAt;
        if (includesSubprocessors) {
          subprocessorEffectiveAt ??= this.resolveSupplierSubprocessorObjectionDeadline(
            now,
            configuredSupplierDeadline,
          );
        }
      } else if (includesSubprocessors) {
        subprocessorEffectiveAt ??= this.resolveSupplierSubprocessorObjectionDeadline(now, configuredSupplierDeadline);
        effectiveAt = subprocessorEffectiveAt;
      }

      await this.sendNotice({
        companyId,
        recipient,
        changedDocuments,
        effectiveAt,
        includesContract,
        subprocessorEffectiveAt: includesSubprocessors ? subprocessorEffectiveAt : null,
      });
    }
  }

  private async sendNotice(plan: LegalNoticePlan): Promise<void> {
    const locale = resolveUserLocale(plan.recipient);
    const email = await this.buildEmail(plan, locale);

    await this.emailService.send(email, { throwOnProviderError: true });

    await this.eventService.publish(
      DomainEvent.LEGAL_NOTICE_SENT,
      {
        entityId: plan.recipient.id,
        payload: {
          versions: currentLegalDocumentVersions(),
          changedDocuments: plan.changedDocuments,
          recipientEmail: plan.recipient.email,
          effectiveAt: plan.effectiveAt,
        },
      },
      { systemCompanyId: plan.companyId, systemUserId: plan.recipient.id },
    );
  }

  private resolveSupplierSubprocessorObjectionDeadline(now: Date, configuredDeadline: string | null): string {
    if (configuredDeadline === null) return new Date(now.getTime() + 14 * DAY_IN_MS).toISOString();

    const deadline = new Date(configuredDeadline);
    if (Number.isNaN(deadline.getTime())) throw new Error("The supplier subprocessor objection deadline is invalid");
    if (deadline <= now) throw new Error("The supplier subprocessor objection deadline must be in the future");
    return deadline.toISOString();
  }

  private getBaselineVersion(
    records: LegalAuditRecord[],
    companyId: string,
    recipientId: string,
    document: LegalDocument,
    kind: "contract" | "information",
  ): string | null {
    const latestEvidence = records.reduce<VersionEvidence | null>((latest, record) => {
      let versions: LegalDocumentVersions | null = null;

      if (kind === "contract") {
        if (record.event === DomainEvent.LEGAL_DOCUMENTS_ACCEPTED && record.entityId === companyId && record.payload)
          versions = record.payload.versions;
        else if (
          record.event === DomainEvent.LEGAL_NOTICE_SENT &&
          record.entityId === recipientId &&
          record.payload?.changedDocuments.includes(document) &&
          hasValidLegalNoticeEffectiveAt(record.payload)
        )
          versions = record.payload.versions;
      } else if (
        record.event === DomainEvent.LEGAL_DOCUMENTS_ACCEPTED &&
        record.userId === recipientId &&
        record.payload?.acceptanceType === "initial-onboarding"
      )
        versions = record.payload.versions;
      else if (
        record.event === DomainEvent.LEGAL_NOTICE_SENT &&
        record.entityId === recipientId &&
        record.payload?.changedDocuments.includes(document) &&
        (document !== "subprocessors" || hasValidLegalNoticeEffectiveAt(record.payload))
      )
        versions = record.payload.versions;

      if (!versions || (latest && latest.createdAt >= record.createdAt)) return latest;
      return { createdAt: record.createdAt, versions };
    }, null);

    return latestEvidence?.versions[document] ?? null;
  }

  private findCurrentNoticeDeadline(records: LegalAuditRecord[], documents: readonly LegalDocument[]): string | null {
    const earliest = records.reduce<{
      createdAt: Date;
      effectiveAt: string;
    } | null>((current, record) => {
      if (
        record.event !== DomainEvent.LEGAL_NOTICE_SENT ||
        !hasCurrentLegalDocumentVersions(record.payload?.versions, documents) ||
        record.payload?.changedDocuments.some((document) => documents.includes(document)) !== true ||
        !hasValidLegalNoticeEffectiveAt(record.payload)
      )
        return current;

      const effectiveAt = new Date(record.payload.effectiveAt);
      if (current && current.createdAt <= record.createdAt) return current;

      return {
        createdAt: record.createdAt,
        effectiveAt: effectiveAt.toISOString(),
      };
    }, null);

    return earliest?.effectiveAt ?? null;
  }

  private getChangedDocuments(
    records: LegalAuditRecord[],
    companyId: string,
    recipient: LegalNoticeRecipient,
    contractAccepted: boolean,
  ): {
    contractDocuments: LegalDocument[];
    informationDocuments: LegalDocument[];
  } {
    const contractDocuments =
      recipient.isSystemAdministrator && !contractAccepted
        ? CONTRACT_LEGAL_DOCUMENTS.filter(
            (document) =>
              this.getBaselineVersion(records, companyId, recipient.id, document, "contract") !==
              LEGAL_DOCUMENT_VERSIONS[document],
          )
        : [];
    const relevantInformationDocuments = recipient.isSystemAdministrator
      ? INFORMATION_LEGAL_DOCUMENTS
      : (["privacy"] as const);
    const informationDocuments = relevantInformationDocuments.filter((document) => {
      const baseline = this.getBaselineVersion(records, companyId, recipient.id, document, "information");
      if (baseline !== null) return baseline !== LEGAL_DOCUMENT_VERSIONS[document];
      return recipient.createdAt.toISOString().slice(0, 10) <= LEGAL_DOCUMENT_VERSIONS[document];
    });

    return {
      contractDocuments: [...contractDocuments],
      informationDocuments: [...informationDocuments],
    };
  }

  private async buildEmail(plan: LegalNoticePlan, locale: Exclude<Locale, "system">) {
    const t = await getTranslator(locale, "LegalDocumentNotice");
    const subject = plan.includesContract ? t("contractSubject") : t("informationSubject");
    const documents = plan.changedDocuments.map((document) => ({
      name: t(`documents.${document}`),
      version: LEGAL_DOCUMENT_VERSIONS[document],
      liveUrl: `${env.BASE_URL}/${locale}/${document}`,
    }));
    const deadline = plan.effectiveAt ? this.formatDate(plan.effectiveAt, locale) : null;
    const hasSubprocessorObjection = plan.changedDocuments.includes("subprocessors");
    const objections = [
      ...(plan.includesContract ? [t("contractObjection")] : []),
      ...(hasSubprocessorObjection
        ? [
            plan.includesContract && plan.subprocessorEffectiveAt && plan.subprocessorEffectiveAt !== plan.effectiveAt
              ? t("subprocessorObjectionWithDeadline", {
                  deadline: this.formatDate(plan.subprocessorEffectiveAt, locale),
                })
              : t("subprocessorObjection"),
          ]
        : []),
    ];

    return {
      to: plan.recipient.email,
      subject,
      react: LegalDocumentNotice({
        body: plan.includesContract ? t("contractBody") : t("informationBody"),
        deadline,
        deadlineLabel: plan.includesContract ? t("contractDeadlineLabel") : t("subprocessorDeadlineLabel"),
        documents,
        greeting: t("greeting", { firstName: plan.recipient.firstName }),
        liveLabel: t("liveLabel"),
        objections,
        signoff: t("signoff"),
        subject,
        title: plan.includesContract ? t("contractTitle") : t("informationTitle"),
      }),
    };
  }

  private formatDate(value: string, locale: Exclude<Locale, "system">): string {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(value));
  }
}
