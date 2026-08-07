import type { EmailService } from "@/features/email/email.service";
import type { EventService } from "@/features/event/event.service";
import type { LegalAuditRecord } from "@/features/legal/get-legal-status.interactor";
import type { LegalDocument, LegalDocumentVersions } from "@/constants/legal-documents";
import type { Locale } from "@/generated/prisma";

import LegalDocumentNotice from "@/components/emails/legal-document-notice";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import {
  CONTRACT_LEGAL_DOCUMENTS,
  INFORMATION_LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_VERSIONS,
  SUBPROCESSOR_OBJECTION_DEADLINE,
  currentLegalDocumentVersions,
} from "@/constants/legal-documents";
import { DomainEvent } from "@/features/event/domain-events";
import {
  LegalAuditRepo,
  hasCurrentLegalVersions,
  legalAcceptancePayload,
  legalNoticePayload,
  noticeIncludesAny,
} from "@/features/legal/get-legal-status.interactor";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";
import { env } from "@/env";

const DAY_MS = 86_400_000;

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

export abstract class SendLegalDocumentNoticesAuditRepo extends LegalAuditRepo {}

type VersionEvidence = {
  createdAt: Date;
  versions: LegalDocumentVersions;
};

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function resolveSubprocessorObjectionDeadline(now: Date, configuredDeadline: string | null): string {
  if (!configuredDeadline) return addDays(now, 14).toISOString();

  const deadline = new Date(configuredDeadline);
  if (Number.isNaN(deadline.getTime())) throw new Error("The configured subprocessor objection deadline is invalid");
  return deadline.toISOString();
}

function releaseDateFor(document: LegalDocument): string {
  return LEGAL_DOCUMENT_VERSIONS[document];
}

function userExistedAtRelease(recipient: LegalNoticeRecipient, document: LegalDocument): boolean {
  return recipient.createdAt.toISOString().slice(0, 10) <= releaseDateFor(document);
}

function latestEvidence(candidates: VersionEvidence[]): VersionEvidence | null {
  return candidates.reduce<VersionEvidence | null>(
    (latest, candidate) => (!latest || candidate.createdAt > latest.createdAt ? candidate : latest),
    null,
  );
}

function contractBaselineVersion(
  records: LegalAuditRecord[],
  companyId: string,
  recipientId: string,
  document: LegalDocument,
): string | null {
  const evidence = records.flatMap<VersionEvidence>((record) => {
    if (record.event === DomainEvent.LEGAL_DOCUMENTS_ACCEPTED && record.entityId === companyId) {
      const payload = legalAcceptancePayload(record);
      return payload ? [{ createdAt: record.createdAt, versions: payload.versions }] : [];
    }

    if (record.event === DomainEvent.LEGAL_NOTICE_SENT && record.entityId === recipientId) {
      const payload = legalNoticePayload(record);
      return payload?.changedDocuments.includes(document)
        ? [{ createdAt: record.createdAt, versions: payload.versions }]
        : [];
    }

    return [];
  });

  return latestEvidence(evidence)?.versions[document] ?? null;
}

function informationBaselineVersion(
  records: LegalAuditRecord[],
  recipientId: string,
  document: LegalDocument,
): string | null {
  const evidence = records.flatMap<VersionEvidence>((record) => {
    if (record.event === DomainEvent.LEGAL_DOCUMENTS_ACCEPTED && record.userId === recipientId) {
      const payload = legalAcceptancePayload(record);
      return payload?.acceptanceType === "initial-onboarding"
        ? [{ createdAt: record.createdAt, versions: payload.versions }]
        : [];
    }

    if (record.event === DomainEvent.LEGAL_NOTICE_SENT && record.entityId === recipientId) {
      const payload = legalNoticePayload(record);
      return payload?.changedDocuments.includes(document)
        ? [{ createdAt: record.createdAt, versions: payload.versions }]
        : [];
    }

    return [];
  });

  return latestEvidence(evidence)?.versions[document] ?? null;
}

function currentContractAccepted(records: LegalAuditRecord[], companyId: string): boolean {
  return records.some(
    (record) =>
      record.event === DomainEvent.LEGAL_DOCUMENTS_ACCEPTED &&
      record.entityId === companyId &&
      hasCurrentLegalVersions(legalAcceptancePayload(record), CONTRACT_LEGAL_DOCUMENTS),
  );
}

function firstCurrentNoticeEffectiveAt(
  records: LegalAuditRecord[],
  documents: readonly LegalDocument[],
): string | null {
  const record = records.find((candidate) => {
    if (candidate.event !== DomainEvent.LEGAL_NOTICE_SENT) return false;
    const payload = legalNoticePayload(candidate);
    return hasCurrentLegalVersions(payload, documents) && noticeIncludesAny(payload, documents);
  });
  const effectiveAt = legalNoticePayload(record ?? null)?.effectiveAt;
  return effectiveAt && !Number.isNaN(new Date(effectiveAt).getTime()) ? effectiveAt : null;
}

function changedContractDocuments(
  records: LegalAuditRecord[],
  companyId: string,
  recipient: LegalNoticeRecipient,
): LegalDocument[] {
  return CONTRACT_LEGAL_DOCUMENTS.filter(
    (document) => contractBaselineVersion(records, companyId, recipient.id, document) !== releaseDateFor(document),
  );
}

function changedInformationDocuments(records: LegalAuditRecord[], recipient: LegalNoticeRecipient): LegalDocument[] {
  const documents = recipient.isSystemAdministrator ? INFORMATION_LEGAL_DOCUMENTS : (["privacy"] as const);

  return documents.filter((document) => {
    const baseline = informationBaselineVersion(records, recipient.id, document);
    if (baseline !== null) return baseline !== releaseDateFor(document);
    return userExistedAtRelease(recipient, document);
  });
}

@SystemInteractor
export class SendLegalDocumentNoticesInteractor {
  constructor(
    private recipientRepo: SendLegalDocumentNoticesRepo,
    private auditRepo: SendLegalDocumentNoticesAuditRepo,
    private emailService: EmailService,
    private eventService: EventService,
    private configuredSubprocessorObjectionDeadline: string | null = SUBPROCESSOR_OBJECTION_DEADLINE,
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

    for (const [companyId, companyRecipients] of companies) {
      await this.sendCompanyNotices(
        companyId,
        companyRecipients.sort((a, b) => Number(b.isSystemAdministrator) - Number(a.isSystemAdministrator)),
        now,
      );
    }
  }

  private async sendCompanyNotices(companyId: string, recipients: LegalNoticeRecipient[], now: Date): Promise<void> {
    const records = await this.auditRepo.findLegalEventsUnscoped(companyId);
    const contractAccepted = currentContractAccepted(records, companyId);
    let contractEffectiveAt = firstCurrentNoticeEffectiveAt(records, CONTRACT_LEGAL_DOCUMENTS);
    let subprocessorEffectiveAt = this.configuredSubprocessorObjectionDeadline
      ? resolveSubprocessorObjectionDeadline(now, this.configuredSubprocessorObjectionDeadline)
      : firstCurrentNoticeEffectiveAt(records, ["subprocessors"]);

    for (const recipient of recipients) {
      const contractDocuments =
        recipient.isSystemAdministrator && !contractAccepted
          ? changedContractDocuments(records, companyId, recipient)
          : [];
      const informationDocuments = changedInformationDocuments(records, recipient);
      const changedDocuments = [...contractDocuments, ...informationDocuments];
      if (changedDocuments.length === 0) continue;

      const includesContract = contractDocuments.length > 0;
      const includesSubprocessors = informationDocuments.includes("subprocessors");
      let effectiveAt: string | null = null;
      if (includesContract) {
        contractEffectiveAt ??= addDays(now, 14).toISOString();
        effectiveAt = contractEffectiveAt;
        if (includesSubprocessors) subprocessorEffectiveAt ??= effectiveAt;
      } else if (includesSubprocessors) {
        subprocessorEffectiveAt ??= resolveSubprocessorObjectionDeadline(now, null);
        effectiveAt = subprocessorEffectiveAt;
      }

      const locale = resolveUserLocale(recipient);
      const email = await this.buildEmail({
        recipient,
        locale,
        changedDocuments,
        effectiveAt,
        includesContract,
        subprocessorEffectiveAt: includesSubprocessors ? subprocessorEffectiveAt : null,
      });
      await this.emailService.send(email);

      await this.eventService.publish(
        DomainEvent.LEGAL_NOTICE_SENT,
        {
          entityId: recipient.id,
          payload: {
            versions: currentLegalDocumentVersions(),
            changedDocuments,
            recipientEmail: recipient.email,
            locale,
            effectiveAt,
          },
        },
        { systemCompanyId: companyId, systemUserId: recipient.id },
      );
    }
  }

  private async buildEmail(args: {
    recipient: LegalNoticeRecipient;
    locale: Exclude<Locale, "system">;
    changedDocuments: LegalDocument[];
    effectiveAt: string | null;
    includesContract: boolean;
    subprocessorEffectiveAt: string | null;
  }) {
    const t = await getTranslator(args.locale, "LegalDocumentNotice");
    const subject = args.includesContract ? t("contractSubject") : t("informationSubject");
    const documents = args.changedDocuments.map((document) => ({
      name: t(`documents.${document}`),
      version: LEGAL_DOCUMENT_VERSIONS[document],
      liveUrl: `${env.BASE_URL}/${args.locale}/${document}`,
    }));
    const deadline = args.effectiveAt
      ? new Intl.DateTimeFormat(args.locale, {
          dateStyle: "long",
          timeZone: "UTC",
        }).format(new Date(args.effectiveAt))
      : null;
    const hasSubprocessorObjection = args.changedDocuments.includes("subprocessors");
    const objections = [
      ...(args.includesContract ? [t("contractObjection")] : []),
      ...(hasSubprocessorObjection
        ? [
            args.includesContract && args.subprocessorEffectiveAt && args.subprocessorEffectiveAt !== args.effectiveAt
              ? t("subprocessorObjectionWithDeadline", {
                  deadline: new Intl.DateTimeFormat(args.locale, {
                    dateStyle: "long",
                    timeZone: "UTC",
                  }).format(new Date(args.subprocessorEffectiveAt)),
                })
              : t("subprocessorObjection"),
          ]
        : []),
    ];

    return {
      to: args.recipient.email,
      subject,
      react: LegalDocumentNotice({
        body: args.includesContract ? t("contractBody") : t("informationBody"),
        deadline,
        deadlineLabel: args.includesContract ? t("contractDeadlineLabel") : t("subprocessorDeadlineLabel"),
        documents,
        greeting: t("greeting", { firstName: args.recipient.firstName }),
        liveLabel: t("liveLabel"),
        objections,
        signoff: t("signoff"),
        subject,
        title: args.includesContract ? t("contractTitle") : t("informationTitle"),
      }),
    };
  }
}
