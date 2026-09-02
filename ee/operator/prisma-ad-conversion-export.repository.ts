import type { AdConversionExportRow, GetAdConversionExportRepo } from "./get/get-ad-conversion-export.interactor";
import type { AdIdentifierKind } from "@/features/acquisition/ad-provider-registry";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

export class PrismaAdConversionExportRepo extends BaseRepository implements GetAdConversionExportRepo {
  @BypassTenantGuard
  async listAdConversionCandidatesUnscoped(noticeVersion: string): Promise<AdConversionExportRow[]> {
    const attributions = await this.prisma.adAttribution.findMany({
      where: { consentNoticeVersion: noticeVersion, company: { conversionEvents: { some: {} } } },
      select: {
        companyId: true,
        provider: true,
        identifierKind: true,
        identifierValue: true,
        clickedAt: true,
        consentNoticeVersion: true,
        company: { select: { conversionEvents: { select: { type: true, occurredAt: true } } } },
      },
    });

    return attributions.flatMap((attribution) =>
      attribution.company.conversionEvents.map((conversion) => ({
        companyId: attribution.companyId,
        provider: attribution.provider,
        identifierKind: attribution.identifierKind as AdIdentifierKind,
        identifierValue: attribution.identifierValue,
        clickedAt: attribution.clickedAt,
        consentNoticeVersion: attribution.consentNoticeVersion,
        conversionType: conversion.type,
        conversionAt: conversion.occurredAt,
      })),
    );
  }
}
