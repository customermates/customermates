import type { Locale } from "@/generated/prisma";

export type LegalNoticeRecipient = {
  id: string;
  companyId: string;
  companyName: string | null;
  createdAt: Date;
  email: string;
  firstName: string;
  displayLanguage: Locale;
  formattingLocale: Locale;
  isSystemAdministrator: boolean;
};

export abstract class SendLegalDocumentNoticesRepo {
  abstract findActiveLegalNoticeRecipientsUnscoped(): Promise<LegalNoticeRecipient[]>;
}
