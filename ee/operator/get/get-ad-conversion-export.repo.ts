import type { AdIdentifierKind } from "@/features/acquisition/ad-provider-registry";
import type { ConversionEventType } from "@/generated/prisma";

export type AdConversionExportRow = {
  companyId: string;
  provider: string;
  identifierKind: AdIdentifierKind;
  identifierValue: string;
  clickedAt: Date;
  consentedAt: Date;
  consentNoticeVersion: string;
  conversionType: ConversionEventType;
  conversionAt: Date;
};

export abstract class GetAdConversionExportRepo {
  abstract listAdConversionCandidatesUnscoped(noticeVersion: string): Promise<AdConversionExportRow[]>;
}
