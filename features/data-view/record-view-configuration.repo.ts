import type { DataView } from "@/generated/prisma";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";

export abstract class RecordViewConfigurationRepo {
  abstract getViewsCompanyWide(
    companyId: string,
    surfaceKeys: string[],
    afterId: string,
    take: number,
  ): Promise<DataView[]>;
  abstract countViewsCompanyWide(companyId: string, surfaceKeys: string[]): Promise<number>;
  abstract deleteViewsCompanyWide(companyId: string, surfaceKeys: string[]): Promise<void>;
  abstract rewriteViewStateCompanyWide(companyId: string, id: string, state: DataViewState): Promise<void>;
}
