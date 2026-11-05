import type { DataViewChipDto, DataViewDto, DataViewVisibility } from "@/core/data-view/data-view-state.schema";

export abstract class ShareDataViewRepo {
  abstract findOwnedOrNull(id: string): Promise<DataViewDto | null>;
  abstract countCompanyRoles(roleIds: string[]): Promise<number>;
  abstract shareOwned(args: {
    id: string;
    visibility: DataViewVisibility;
    roleIds: string[];
  }): Promise<DataViewChipDto | null>;
}
