import type { PublicLinkAccess } from "./public-link-access";
import type { RecordPresentationReader } from "./public-list-reader";
import type { PublicListRecordsInput, PublicRecordsResult } from "./public-link.schema";

import { recordSurfaceTypeId } from "@/core/data-view/data-view-keys";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { PUBLIC_LINK_UNAVAILABLE } from "./public-link-access";
import { publicListPage } from "./public-list-reader";
import { PublicListRecordsSchema } from "./public-link.schema";

@AllowInDemoMode
@SystemInteractor
export class ReadPublicListRecordsInteractor {
  constructor(
    private access: PublicLinkAccess,
    private presentation: RecordPresentationReader,
  ) {}

  async invoke(raw: PublicListRecordsInput & { visitor?: string | null }): Promise<PublicRecordsResult> {
    const { visitor, ...rest } = raw;
    const parsed = PublicListRecordsSchema.safeParse(rest);
    if (!parsed.success) return PUBLIC_LINK_UNAVAILABLE;
    const input = parsed.data;

    return this.access.open(input.token, visitor, async (link): Promise<PublicRecordsResult> => {
      const typeId = recordSurfaceTypeId(link.view.surfaceKey);
      if (!typeId) return PUBLIC_LINK_UNAVAILABLE;
      const records = await publicListPage(this.presentation, typeId, link.viewId, {
        page: input.page,
        pageSize: input.pageSize,
        sortDescriptor: input.sortDescriptor,
        filters: input.filters,
        searchTerm: input.searchTerm,
      });
      return records ? { status: "available", ...records } : PUBLIC_LINK_UNAVAILABLE;
    });
  }
}
