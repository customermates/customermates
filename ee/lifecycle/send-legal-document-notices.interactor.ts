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
import {
  hasValidLegalNoticeEffectiveAt,
  type LegalAuditRecord,
  type LegalAuditRepo,
} from "@/features/legal/legal-audit.repo";
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

type SendLegalDocumentNoticesOptions = {
  now?: Date;
  supplierSubprocessorObjectionDeadline?: string | null;
};

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

  async invoke(options: SendLegalDocumentNoticesOptions = {}): Promise<void> {
    if (env.APP_MODE !== "cloud") return;

    const now = options.now ?? new Date();
    const configuredSupplierDeadline =
      options.supplierSubprocessorObjectionDeadline === undefined
        ? SUPPLIER_SUBPROCESSOR_OBJECTION_DEADLINE
        : options.supplierSubprocessorObjectionDeadline;
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
        configuredSupplierDeadline,
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
    const contractAccepted = this.isCurrentContractAccepted(records, companyId);
    let contractEffectiveAt = this.findCurrentNoticeDeadline(records, CONTRACT_LEGAL_DOCUMENTS);
    let subprocessorEffectiveAt =
      configuredSupplierDeadline === null ? this.findCurrentNoticeDeadline(records, ["subprocessors"]) : null;

    for (const recipient of recipients) {
      const contractDocuments =
        recipient.isSystemAdministrator && !contractAccepted
          ? this.getChangedContractDocuments(records, companyId, recipient)
          : [];
      const informationDocuments = this.getChangedInformationDocuments(records, recipient);
      const changedDocuments = [...contractDocuments, ...informationDocuments];
      if (changedDocuments.length === 0) continue;

      const includesContract = contractDocuments.length > 0;
      const includesSubprocessors = informationDocuments.includes("subprocessors");
      let effectiveAt: string | null = null;

      if (includesContract) {
        contractEffectiveAt ??= this.addDays(now, 14).toISOString();
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
          locale,
          effectiveAt: plan.effectiveAt,
        },
      },
      { systemCompanyId: plan.companyId, systemUserId: plan.recipient.id },
    );
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY_IN_MS);
  }

  private resolveSupplierSubprocessorObjectionDeadline(now: Date, configuredDeadline: string | null): string {
    if (configuredDeadline === null) return this.addDays(now, 14).toISOString();

    const deadline = new Date(configuredDeadline);
    if (Number.isNaN(deadline.getTime())) throw new Error("The supplier subprocessor objection deadline is invalid");
    if (deadline <= now) throw new Error("The supplier subprocessor objection deadline must be in the future");
    return deadline.toISOString();
  }

  private userExistedAtRelease(recipient: LegalNoticeRecipient, document: LegalDocument): boolean {
    return recipient.createdAt.toISOString().slice(0, 10) <= LEGAL_DOCUMENT_VERSIONS[document];
  }

  private latestEvidence(candidates: VersionEvidence[]): VersionEvidence | null {
    return candidates.reduce<VersionEvidence | null>(
      (latest, candidate) => (!latest || candidate.createdAt > latest.createdAt ? candidate : latest),
      null,
    );
  }

  private getContractBaselineVersion(
    records: LegalAuditRecord[],
    companyId: string,
    recipientId: string,
    document: LegalDocument,
  ): string | null {
    const evidence = records.flatMap<VersionEvidence>((record) => {
      if (record.event === DomainEvent.LEGAL_DOCUMENTS_ACCEPTED && record.entityId === companyId && record.payload)
        return [{ createdAt: record.createdAt, versions: record.payload.versions }];

      if (
        record.event === DomainEvent.LEGAL_NOTICE_SENT &&
        record.entityId === recipientId &&
        record.payload?.changedDocuments.includes(document) &&
        hasValidLegalNoticeEffectiveAt(record.payload)
      )
        return [{ createdAt: record.createdAt, versions: record.payload.versions }];

      return [];
    });

    return this.latestEvidence(evidence)?.versions[document] ?? null;
  }

  private getInformationBaselineVersion(
    records: LegalAuditRecord[],
    recipientId: string,
    document: LegalDocument,
  ): string | null {
    const evidence = records.flatMap<VersionEvidence>((record) => {
      if (
        record.event === DomainEvent.LEGAL_DOCUMENTS_ACCEPTED &&
        record.userId === recipientId &&
        record.payload?.acceptanceType === "initial-onboarding"
      )
        return [{ createdAt: record.createdAt, versions: record.payload.versions }];

      if (
        record.event === DomainEvent.LEGAL_NOTICE_SENT &&
        record.entityId === recipientId &&
        record.payload?.changedDocuments.includes(document) &&
        (document !== "subprocessors" || hasValidLegalNoticeEffectiveAt(record.payload))
      )
        return [{ createdAt: record.createdAt, versions: record.payload.versions }];

      return [];
    });

    return this.latestEvidence(evidence)?.versions[document] ?? null;
  }

  private isCurrentContractAccepted(records: LegalAuditRecord[], companyId: string): boolean {
    return records.some(
      (record) =>
        record.event === DomainEvent.LEGAL_DOCUMENTS_ACCEPTED &&
        record.entityId === companyId &&
        hasCurrentLegalDocumentVersions(record.payload?.versions, CONTRACT_LEGAL_DOCUMENTS),
    );
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

  private getChangedContractDocuments(
    records: LegalAuditRecord[],
    companyId: string,
    recipient: LegalNoticeRecipient,
  ): LegalDocument[] {
    return CONTRACT_LEGAL_DOCUMENTS.filter(
      (document) =>
        this.getContractBaselineVersion(records, companyId, recipient.id, document) !==
        LEGAL_DOCUMENT_VERSIONS[document],
    );
  }

  private getChangedInformationDocuments(
    records: LegalAuditRecord[],
    recipient: LegalNoticeRecipient,
  ): LegalDocument[] {
    const documents = recipient.isSystemAdministrator ? INFORMATION_LEGAL_DOCUMENTS : (["privacy"] as const);

    return documents.filter((document) => {
      const baseline = this.getInformationBaselineVersion(records, recipient.id, document);
      if (baseline !== null) return baseline !== LEGAL_DOCUMENT_VERSIONS[document];
      return this.userExistedAtRelease(recipient, document);
    });
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
