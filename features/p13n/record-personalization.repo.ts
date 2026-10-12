import type { P13n } from "@/generated/prisma";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { RecordDetailLayout } from "@/features/records/record-detail-layout.schema";

export abstract class RecordPersonalizationRepo {
  abstract getDetailOptionsCompanyWide(
    companyId: string,
    p13nIds: string[],
    afterId?: string,
  ): Promise<Array<Pick<P13n, "id" | "p13nId" | "detailOptions" | "columnOrder">>>;
  abstract getPersonalizationsCompanyWide(
    companyId: string,
    p13nIds: string[],
    afterId: string,
    take: number,
  ): Promise<P13n[]>;
  abstract countPersonalizationsCompanyWide(companyId: string, p13nIds: string[]): Promise<number>;
  abstract deletePersonalizationsCompanyWide(companyId: string, p13nIds: string[]): Promise<void>;
  abstract rewritePersonalizationStateCompanyWide(companyId: string, id: string, state: DataViewState): Promise<void>;
  abstract rewriteDetailLayoutCompanyWide(companyId: string, id: string, layout: RecordDetailLayout): Promise<void>;
}
